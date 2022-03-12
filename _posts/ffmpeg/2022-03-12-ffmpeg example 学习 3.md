---
layout: post
title: "ffmpeg example 3.音频编码"
date: 2022-03-12 
tag: ffmpeg
---

关于如何源码调试，参考前面的文章[ffmpeg example 视频编码 - 掘金](https://juejin.cn/post/7073796134912655367)

今天分析`encode_audio.c`学习ffmpeg如何编码音频数据，由于太简单了，直接贴代码

##main函数

```c
int main(int argc, char **argv)
{
    const char *filename;
    const AVCodec *codec;
    AVCodecContext *c= NULL;
    AVFrame *frame;
    AVPacket *pkt;
    int i, j, k, ret;
    FILE *f;
    uint16_t *samples;
    float t, tincr;

    if (argc <= 1) {
        fprintf(stderr, "Usage: %s <output file>\n", argv[0]);
        return 0;
    }
    filename = argv[1];

    /* 根据codec_id 找到对应的音频编码器 */
    codec = avcodec_find_encoder(AV_CODEC_ID_MP2);
    if (!codec) {
        fprintf(stderr, "Codec not found\n");
        exit(1);
    }
    /* 创建编码器AVCodecContext上下文 */
    c = avcodec_alloc_context3(codec);
    if (!c) {
        fprintf(stderr, "Could not allocate audio codec context\n");
        exit(1);
    }

    /* 设置码率 */
    c->bit_rate = 64000;

    /* 采样格式 */
    c->sample_fmt = AV_SAMPLE_FMT_S16;
    /* 检查编码器是否支持该采样格式 */
    if (!check_sample_fmt(codec, c->sample_fmt)) {
        fprintf(stderr, "Encoder does not support sample format %s",
                av_get_sample_fmt_name(c->sample_fmt));
        exit(1);
    }

    /* select other audio parameters supported by the encoder */
    /* 设置采样率 */
    c->sample_rate    = select_sample_rate(codec);
    /* 声道布局 */
    c->channel_layout = select_channel_layout(codec);
    /* 声道数量 */
    c->channels       = av_get_channel_layout_nb_channels(c->channel_layout);

    /* 打开编码器 */
    if (avcodec_open2(c, codec, NULL) < 0) {
        fprintf(stderr, "Could not open codec\n");
        exit(1);
    }
    /* 打开写文件 */
    f = fopen(filename, "wb");
    if (!f) {
        fprintf(stderr, "Could not open %s\n", filename);
        exit(1);
    }

    /* 创建pkt，保存编码后的数据 */
    pkt = av_packet_alloc();
    if (!pkt) {
        fprintf(stderr, "could not allocate the packet\n");
        exit(1);
    }

    /* 创建frame， 保存编码前的数据 */
    frame = av_frame_alloc();
    if (!frame) {
        fprintf(stderr, "Could not allocate audio frame\n");
        exit(1);
    }
    /* 给frame 设置参数 */
    // 每个声道有多少个采样
    frame->nb_samples     = c->frame_size;
    // 采样的格式
    frame->format         = c->sample_fmt;
    // 声道布局
    frame->channel_layout = c->channel_layout;

    /* 给 frame 内部分配内存 */
    ret = av_frame_get_buffer(frame, 0);
    if (ret < 0) {
        fprintf(stderr, "Could not allocate audio data buffers\n");
        exit(1);
    }

    /* 给frame填充数据，编码，写入文件 */
    t = 0;
    tincr = 2 * M_PI * 440.0 / c->sample_rate;
    for (i = 0; i < 200; i++) {
        /* make sure the frame is writable -- makes a copy if the encoder
         * kept a reference internally */

        /*确定frame是可写的，如果frame被编码器内部引用，会变成不可写，调用此方法，给frame内部的buf指向新分配的空间，使其变为可写。 */
        ret = av_frame_make_writable(frame);
        if (ret < 0)
            exit(1);
        //获得写入的指针，由于设置的是AV_SAMPLE_FMT_S16，非平面类型，data[0]保存了写入地址。
        samples = (uint16_t*)frame->data[0];

        for (j = 0; j < c->frame_size; j++) {
            samples[2*j] = (int)(sin(t) * 10000);
            //多个声道，交错写数据
            for (k = 1; k < c->channels; k++)
                samples[2*j + k] = samples[2*j];
            t += tincr;
        }
        //编码，写文件
        encode(c, frame, pkt, f);
    }

    /* 冲洗编码器，读出剩余数据，写入文件 */
    encode(c, NULL, pkt, f);

    //关闭文件
    fclose(f);
    //释放资源
    av_frame_free(&frame);
    av_packet_free(&pkt);
    avcodec_free_context(&c);

    return 0;
}
```

## 验证采样格式，找最大采样率，声道数

```c
/* check that a given sample format is supported by the encoder */
static int check_sample_fmt(const AVCodec *codec, enum AVSampleFormat sample_fmt)
{
    //sample_fmts: array of supported sample formats, or NULL if unknown, array is terminated by -1
    //支持的采样格式数组，为空，或者以-1结尾
    const enum AVSampleFormat *p = codec->sample_fmts;
    //判断设置的采样格式是否支持，1 支持 0 不支持
    while (*p != AV_SAMPLE_FMT_NONE) {
        if (*p == sample_fmt)
            return 1;
        p++;
    }
    return 0;
}

/* just pick the highest supported samplerate */
static int select_sample_rate(const AVCodec *codec)
{
    const int *p;
    int best_samplerate = 0;
    //supported_samplerates: array of supported audio samplerates, or NULL if unknown, array is terminated by 0
    //supported_samplerates 保存了支持的采样率的数组，为空，或者以 0 结尾
    if (!codec->supported_samplerates)
        //为空，返回44100
        return 44100;

    p = codec->supported_samplerates;
    //找到支持的采样率的最大值
    while (*p) {
        if (!best_samplerate || abs(44100 - *p) < abs(44100 - best_samplerate))
            best_samplerate = *p;
        p++;
    }
    return best_samplerate;
}

/* select layout with the highest channel count */
static int select_channel_layout(const AVCodec *codec)
{
    const uint64_t *p;
    uint64_t best_ch_layout = 0;
    int best_nb_channels   = 0;
    //channel_layouts: array of support channel layouts, or NULL if unknown. array is terminated by 0
    //channel_layouts 保存了支持的所有声道布局数组，为空，或者以 0 结尾
    if (!codec->channel_layouts)
        //为空，返回AV_CH_LAYOUT_STEREO
        return AV_CH_LAYOUT_STEREO;

    //找声道数最多的那个
    p = codec->channel_layouts;
    while (*p) {
        int nb_channels = av_get_channel_layout_nb_channels(*p);

        if (nb_channels > best_nb_channels) {
            best_ch_layout    = *p;
            best_nb_channels = nb_channels;
        }
        p++;
    }
    return best_ch_layout;
}
```

## encode

```c
static void encode(AVCodecContext *ctx, AVFrame *frame, AVPacket *pkt,
                   FILE *output)
{
    int ret;

    /* 给编码器发送frame */
    ret = avcodec_send_frame(ctx, frame);
    if (ret < 0) {
        fprintf(stderr, "Error sending the frame to the encoder\n");
        exit(1);
    }

    /* read all the available output packets (in general there may be any
     * number of them */
    while (ret >= 0) {
        //从编码器中读pkt，pkt里面保存了编码后的数据
        ret = avcodec_receive_packet(ctx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF)
            //EAGAIN编码器还需要更多的frame才能继续输出pkt
            //AVERROR_EOF编码器没有更多数据可以读取了，例如被冲洗了
            return;
        else if (ret < 0) {
            fprintf(stderr, "Error encoding audio frame\n");
            exit(1);
        }
        //写入文件
        fwrite(pkt->data, 1, pkt->size, output);
        //取消引用pkt
        av_packet_unref(pkt);
    }
}
```

## 备注

### ffmpeg 支持的音频编码器

```
ffmpeg -codecs | grep encoder | grep -i audio
 DEAIL. aac                  AAC (Advanced Audio Coding) (decoders: aac aac_fixed aac_at ) (encoders: aac aac_at )
 DEAI.S alac                 ALAC (Apple Lossless Audio Codec) (decoders: alac alac_at ) (encoders: alac alac_at )
 DEAIL. mp2                  MP2 (MPEG audio layer 2) (decoders: mp2 mp2float mp2_at ) (encoders: mp2 mp2fixed )
 DEAIL. mp3                  MP3 (MPEG audio layer 3) (decoders: mp3float mp3 mp3_at ) (encoders: libmp3lame )
 DEAIL. opus                 Opus (Opus Interactive Audio Codec) (decoders: opus libopus ) (encoders: opus libopus )
 DEAIL. ra_144               RealAudio 1.0 (14.4K) (decoders: real_144 ) (encoders: real_144 )
```

示例中选择的是AV_CODEC_ID_MP2

通过avcodec_find_encoder(AV_CODEC_ID_MP2)来找到对应的编码器

你也可以尝试mp3，aac ，opus 之类的。

### 采样格式，分平面型和非平面型

```
enum AVSampleFormat {
    AV_SAMPLE_FMT_NONE = -1,
    AV_SAMPLE_FMT_U8,          ///< unsigned 8 bits
    AV_SAMPLE_FMT_S16,         ///< signed 16 bits
    AV_SAMPLE_FMT_S32,         ///< signed 32 bits
    AV_SAMPLE_FMT_FLT,         ///< float
    AV_SAMPLE_FMT_DBL,         ///< double

    AV_SAMPLE_FMT_U8P,         ///< unsigned 8 bits, planar
    AV_SAMPLE_FMT_S16P,        ///< signed 16 bits, planar
    AV_SAMPLE_FMT_S32P,        ///< signed 32 bits, planar
    AV_SAMPLE_FMT_FLTP,        ///< float, planar
    AV_SAMPLE_FMT_DBLP,        ///< double, planar
    AV_SAMPLE_FMT_S64,         ///< signed 64 bits
    AV_SAMPLE_FMT_S64P,        ///< signed 64 bits, planar

    AV_SAMPLE_FMT_NB           ///< Number of sample formats. DO NOT USE if linking dynamically
};
```

后缀带P的就是平面型的，不带P的就是交错型的。

参考[音频格式解析：交错模式 vs Plane模式_lyy901135的博客-CSDN博客_plane模式](https://blog.csdn.net/lyy901135/article/details/103061967)

### 时间戳

在h264视频编码的时候，有打时间戳，音频编码没有看到打时间戳的环节，之后再探究。
