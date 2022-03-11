---
layout: post
title: "ffmpeg example 2.视频编码"
date: 2022-03-11 
tag: ffmpeg
---

调试ffmpeg源码教程

- [如何使用vscode在macOS平台调试ffmpeg](https://yxibng.github.io/2022/03/%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8vscode%E5%9C%A8macOS%E5%B9%B3%E5%8F%B0%E8%B0%83%E8%AF%95ffmpeg/)

- [使用Xcode调试ffmpeg](https://yxibng.github.io/2022/03/%E4%BD%BF%E7%94%A8Xcode%E8%B0%83%E8%AF%95ffmpeg/)
  
      

今天用Xcode调试分析 `encode_video.c`

## 配置ffmpeg 支持libx264和h264_videotoolbox来进行视频编码

```shell
cd ffmpeg
./configure  --disable-optimizations --disable-stripping --enable-debug=3 --disable-doc --enable-libx264 --enable-gpl --enable-videotoolboxm
make -j 16
make examples
```

如果没有libx264， 通过 [Homebrew](https://brew.sh/) 安装一下

```shell
brew install x264
```

ffmpeg  通过[pkg-config](https://www.freedesktop.org/wiki/Software/pkg-config/)可以找到x264对应的头文件和库的路径

```shell
➜  ffmpeg git:(master) ✗ pkg-config --libs --cflags x264
-DX264_API_IMPORTS -I/opt/homebrew/Cellar/x264/r3060/include -L/opt/homebrew/Cellar/x264/r3060/lib -lx264
```

## 配置Xcode

添加target，配置路径

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16469917993141646991798582.png)

配置可执行文件，启动参数

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16469918543121646991854240.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16469918963141646991895699.png)

encode_video_g 接受两个参数，

1. 视频编码数据的写入路径

2. 编码器名字（libx264 libx264rgb h264_videotoolbox）



我们使用h264编码器，查看ffmpeg 支持的h264编码器

```shell
ffmpeg -codecs | grep 264
DEV.LS h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (encoders: libx264 libx264rgb h264_videotoolbox )
```

## 源码分析

### main函数

```c
int main(int argc, char **argv)
{
    const char *filename, *codec_name;
    const AVCodec *codec;
    AVCodecContext *c= NULL;
    int i, ret, x, y;
    FILE *f;
    AVFrame *frame;
    AVPacket *pkt;
    uint8_t endcode[] = { 0, 0, 1, 0xb7 };

    if (argc <= 2) {
        fprintf(stderr, "Usage: %s <output file> <codec name>\n", argv[0]);
        exit(0);
    }
    filename = argv[1];
    codec_name = argv[2];

    /* 根据编码器名字，找到对应的编码器，编码器的名字如libx264,h264_videotoolbox */
    codec = avcodec_find_encoder_by_name(codec_name);
    if (!codec) {
        fprintf(stderr, "Codec '%s' not found\n", codec_name);
        exit(1);
    }
    /* 创建编码器上下文 */
    c = avcodec_alloc_context3(codec);
    if (!c) {
        fprintf(stderr, "Could not allocate video codec context\n");
        exit(1);
    }
    /* 创建 pkt 用于保存编码后的数据 */
    pkt = av_packet_alloc();
    if (!pkt)
        exit(1);
    /* 配置编码参数 */
    //码率400000
    c->bit_rate = 400000;
    //编码分辨率，宽高必须能被2整除
    c->width = 352;
    c->height = 288;
    /*
     编码的时间基,可以理解为刻度，与 pts 有关
     (AVRational){1, 25} 将1秒钟分成25份，每一份代表 1/25 秒
     */
    c->time_base = (AVRational){1, 25};
    /* 编码帧率 25 帧 */
    c->framerate = (AVRational){25, 1};
    
    /* 关键帧间隔，每10帧产生一个关键帧, 如果frame->pict_type 被设置为AV_PICTURE_TYPE_I
     gop_size的值会被忽略，编码器不产出B帧和P帧，只会编码I帧
     */
    c->gop_size = 10;
    /* b帧的个数，实时通信一般设置为0 */
    c->max_b_frames = 1;
    /* 编码的数据源的格式，yuv420p */
    c->pix_fmt = AV_PIX_FMT_YUV420P;
    /* 如果使用h264编码器，设置preset 为slow */
    if (codec->id == AV_CODEC_ID_H264)
        av_opt_set(c->priv_data, "preset", "slow", 0);

    /*
     打开编码器
     */
    ret = avcodec_open2(c, codec, NULL);
    if (ret < 0) {
        fprintf(stderr, "Could not open codec: %s\n", av_err2str(ret));
        exit(1);
    }
    /* 打开输出文件 */
    f = fopen(filename, "wb");
    if (!f) {
        fprintf(stderr, "Could not open %s\n", filename);
        exit(1);
    }
    /* 创建AVFrame用于存放待编码的数据，yuv */
    frame = av_frame_alloc();
    if (!frame) {
        fprintf(stderr, "Could not allocate video frame\n");
        exit(1);
    }
    /* 设置frame 的颜色格式，宽高 */
    frame->format = c->pix_fmt;
    frame->width  = c->width;
    frame->height = c->height;
    /* 根据上面设置的参数，给frame 内部的 buf 分配内存 */
    ret = av_frame_get_buffer(frame, 0);
    if (ret < 0) {
        fprintf(stderr, "Could not allocate the video frame data\n");
        exit(1);
    }

    /* 编码1秒钟的数据，上面设置的编码帧率是 25 帧  */
    for (i = 0; i < 25; i++) {
        fflush(stdout);
        /*
         确保frame中的数据是可写的。
         刚开始调用 av_frame_get_buffer()，frame中的数据是可写的。
         后面将frame送给编码器去编码，可能被编码器引用，此时frame是不可写的。
         调用av_frame_make_writable()会检查frame 是否可写，
         如果不可写，会给frame内部重新创建新的buffer。
         */
        ret = av_frame_make_writable(frame);
        if (ret < 0)
            exit(1);

        /* 给frame填充数据，我们设置的是yuv420，这里填充假数据 */
        /* Y */
        for (y = 0; y < c->height; y++) {
            for (x = 0; x < c->width; x++) {
                frame->data[0][y * frame->linesize[0] + x] = x + y + i * 3;
            }
        }
        /* Cb and Cr */
        for (y = 0; y < c->height/2; y++) {
            for (x = 0; x < c->width/2; x++) {
                frame->data[1][y * frame->linesize[1] + x] = 128 + y + i * 2;
                frame->data[2][y * frame->linesize[2] + x] = 64 + x + i * 5;
            }
        }

        /*
         设置frame的pts
         我们设置的是每秒25帧
         对应的时间转成秒是 pts * av_q2d(c->time_base)
         */
        frame->pts = i;

        /*
         将frame 送给编码器编码，将编码后的数据写入文件
         */
        encode(c, frame, pkt, f);
    }

    /*
     冲洗编码器，将剩余的编码后的数据读出来，写入文件
     */
    encode(c, NULL, pkt, f);

    /* Add sequence end code to have a real MPEG file.
       It makes only sense because this tiny examples writes packets
       directly. This is called "elementary stream" and only works for some
       codecs. To create a valid file, you usually need to write packets
       into a proper file format or protocol; see muxing.c.
     */
    if (codec->id == AV_CODEC_ID_MPEG1VIDEO || codec->id == AV_CODEC_ID_MPEG2VIDEO)
        fwrite(endcode, 1, sizeof(endcode), f);
    
    //关闭文件
    fclose(f);
    //释放资源
    avcodec_free_context(&c);
    av_frame_free(&frame);
    av_packet_free(&pkt);

    return 0;
}
```

1. 从命令行中输出文件的路径， 使用的编码器名字

2. 根据名字找到对应的编码器

3. 创建编码器上下文，设置编码器的参数（码率，时间基，帧率，宽高，颜色格式，b帧个数）

4. 打开编码器

5. 创建AVFrame 保存待编码的数据

6. 创建AVPacket保存编码后的数据

7. 编码1秒钟的数据

8. 重新编码器，将剩余数据读出

9. 关闭文件，释放资源



### encode

```c
static void encode(AVCodecContext *enc_ctx, AVFrame *frame, AVPacket *pkt,
                   FILE *outfile)
{
    int ret;

    /* send the frame to the encoder */
    if (frame)
        printf("Send frame %3"PRId64"\n", frame->pts);

    //给编码器送frame
    ret = avcodec_send_frame(enc_ctx, frame);
    if (ret < 0) {
        fprintf(stderr, "Error sending a frame for encoding\n");
        exit(1);
    }

    while (ret >= 0) {
        //从编码器读pkt
        ret = avcodec_receive_packet(enc_ctx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF)
        {
            //EAGAIN 代表需要继续送入 frame 才可以开始读取
            //AVERROR_EOF 代表编码器已经没有数据可以读了
            return;
        }
        else if (ret < 0) {
            fprintf(stderr, "Error during encoding\n");
            exit(1);
        }

        printf("Write packet %3"PRId64" (size=%5d)\n", pkt->pts, pkt->size);
        //将编码后的数据写入文件
        fwrite(pkt->data, 1, pkt->size, outfile);
        //取消引用pkt
        av_packet_unref(pkt);
    }
}
```



1. 调用   avcodec_send_frame 给编码器送frame

2. 循环调用avcodec_receive_packet 从编码器读pkt
   
   - EAGAIN 代表需要继续送入 frame 才可以开始读取
   
   - AVERROR_EOF 代表编码器已经没有数据可以读了,例如传入空的frame，对编码器进行了flush操作

3. 将编码后数据写入文件

4. 取消引用pkt
   
   




