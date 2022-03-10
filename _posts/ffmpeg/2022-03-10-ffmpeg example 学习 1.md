---
layout: post
title: "ffmpeg example 1.解封装，解码学习"
date: 2022-03-10 
tag: ffmpeg

---



## 背景

学习ffmpeg，打算从源码入手，源码又太多太复杂。好在ffmpeg提供了示例代码，演示如何使用ffmpeg的api， 示例代码位于`ffmpeg/doc/examples`目录下，可以[通过vscode 来调试](https://yxibng.github.io/2022/03/%E5%A6%82%E4%BD%95%E4%BD%BF%E7%94%A8vscode%E5%9C%A8macOS%E5%B9%B3%E5%8F%B0%E8%B0%83%E8%AF%95ffmpeg/)这些示例代码，理解ffmpeg的调用方式。



该目录下的示例代码如下

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468967433771646896743076.png)

- decode_audio.c  演示如何解码音频

- decode_video.c  演示如何解码视频

- demuxing_decoding.c  演示如何解封装文件，和解码音视频

今天来分析 `demuxing_decoding.c`



## 流程




使用的模块`libavutil`,`libavcodec`,`libavformat`

- libavutil  包含一些公共的工具函数

- libavcodec 用于各种类型声音/图像编解码

- libavformat 用于各种音视频封装格式的生成和解析，包括获取解码所需信息以生成解码上下文结构和读取音视频帧等功能，包含demuxers和muxer库

### 1.解封装

1. 打开文件、获取封装信息上下文AVFormatContext（avformat_open_input）

2. 获取媒体文件音视频信息，这一步会将AVFormatContext内部变量填充（avformat_find_stream_info）

3. 获取音视频流ID。一般有两种方法：
   
   1. 遍历AVFormatContext内部所有的stream，如果stream的codec_type对应为audio/video，这记录当前stream的ID；
   
   2. FFmpeg提供av_find_best_stream接口，可以直接获取相应类型（audio or video）的流ID

4. 获取流的每一帧数据（av_read_frame）  

5. 关闭文件

### 2.解码

解码在解封装的基础上，将每一帧数据进行解码。步骤如下：

1. 申请解码器上下文AVCodecContext（avcodec_alloc_context3）

2. 初始化AVCodecContext参数，可以使用将解封装得到的流的解码器参数设置进来（avcodec_parameters_to_context）

3. 打开解码器（avcodec_open2）

4. 解码每一帧数据。只需要将解封装获取的帧传递给解码器（avcodec_send_packet），再接收即可（avcodec_receive_frame）

5. 关闭文件和解码器
   
   
   

## 源码分析

#### main 函数，简化版

```c
int main (int argc, char **argv)
{
    /*
     打开输入文件，创建AVFormatContext
    */
    if (avformat_open_input(&fmt_ctx, src_filename, NULL, NULL) < 0) {
        fprintf(stderr, "Could not open source file %s\n", src_filename);
        exit(1);
    }

    /* 获取封装格式中的音视频信息，填充在AVFormatContext中 */
    if (avformat_find_stream_info(fmt_ctx, NULL) < 0) {
        fprintf(stderr, "Could not find stream information\n");
        exit(1);
    }
    /*
    1. 从 fmt_ctx 读取视频对应的AVStream
    2. 从 AVStream 读取解码相关的 AVCodec
    3. 根据 AVCodec 创建 AVCodecContext，根据 AVStream 给 AVCodecContext 填充解码参数
    4. 打开解码器
    */
    if (open_codec_context(&video_stream_idx, &video_dec_ctx, fmt_ctx, AVMEDIA_TYPE_VIDEO) >= 0) {
        video_stream = fmt_ctx->streams[video_stream_idx];
    }
    /*
    1. 从 fmt_ctx 读取音频对应的AVStream
    2. 从 AVStream 读取解码相关的 AVCodec
    3. 根据 AVCodec 创建 AVCodecContext，根据 AVStream 给 AVCodecContext 填充解码参数
    4. 打开解码器
    */
    if (open_codec_context(&audio_stream_idx, &audio_dec_ctx, fmt_ctx, AVMEDIA_TYPE_AUDIO) >= 0) {
        audio_stream = fmt_ctx->streams[audio_stream_idx];
    }

    //创建frame, 用于存储解码后的数据
    frame = av_frame_alloc();
    //创建pkt，用于存储解封装后从文件中读取的音视频包
    pkt = av_packet_alloc();
    /*
    从文件中循环读取音视频帧，存入pkt
    根据类型区分音频帧还是视频帧，分别送给对应的解码器去解码
    */
    while (av_read_frame(fmt_ctx, pkt) >= 0) {
        // check if the packet belongs to a stream we are interested in, otherwise
        // skip it
        if (pkt->stream_index == video_stream_idx)
            ret = decode_packet(video_dec_ctx, pkt);
        else if (pkt->stream_index == audio_stream_idx)
            ret = decode_packet(audio_dec_ctx, pkt);
        av_packet_unref(pkt);
        if (ret < 0)
            break;
    }

    /* 冲洗音视频解码器，将剩余的解码数据读出来 */
    if (video_dec_ctx)
        decode_packet(video_dec_ctx, NULL);
    if (audio_dec_ctx)
        decode_packet(audio_dec_ctx, NULL);
end:
    //资源释放和退出
    avcodec_free_context(&video_dec_ctx);
    avcodec_free_context(&audio_dec_ctx);
    avformat_close_input(&fmt_ctx);
    if (video_dst_file)
        fclose(video_dst_file);
    if (audio_dst_file)
        fclose(audio_dst_file);
    av_packet_free(&pkt);
    av_frame_free(&frame);
    av_free(video_dst_data[0]);

    return ret < 0;
}

```

1. 验证输入参数是否正确

2. 打开文件，读取封装信息

3. 根据封装信息，分别创建视频解码器和音频解码器

4. 循环从文件中读取pkt
   
   1. 如果是视频数据，送到视频解码器，解码后写入视频文件
   
   2. 如果是音频数据，送到音频解码器，解码后写入音频文件

5. 冲洗音频视频解码器，读取剩余数据

6. 清理资源退出

# 

#### open_codec_context

```c
static int open_codec_context(int *stream_idx,
                              AVCodecContext **dec_ctx, AVFormatContext *fmt_ctx, enum AVMediaType type)
{
    int ret, stream_index;
    AVStream *st;
    const AVCodec *dec = NULL;
    //找到音频/视频对应的stream_index
    ret = av_find_best_stream(fmt_ctx, type, -1, -1, NULL, 0);
    if (ret < 0) {
        fprintf(stderr, "Could not find %s stream in input file '%s'\n",
                av_get_media_type_string(type), src_filename);
        return ret;
    } else {
        stream_index = ret;
        //获取音频/视频对应的AVStream
        st = fmt_ctx->streams[stream_index];

        /* 获取解码对应的AVCodec */
        dec = avcodec_find_decoder(st->codecpar->codec_id);
        if (!dec) {
            fprintf(stderr, "Failed to find %s codec\n",
                    av_get_media_type_string(type));
            return AVERROR(EINVAL);
        }

        /* 根据AVCodec 创建 AVCodecContext */
        *dec_ctx = avcodec_alloc_context3(dec);
        if (!*dec_ctx) {
            fprintf(stderr, "Failed to allocate the %s codec context\n",
                    av_get_media_type_string(type));
            return AVERROR(ENOMEM);
        }
        /* 将AVStream的codecpar中保存的解码相关的参数，填充到AVCodecContext中 */
        if ((ret = avcodec_parameters_to_context(*dec_ctx, st->codecpar)) < 0) {
            fprintf(stderr, "Failed to copy %s codec parameters to decoder context\n",
                    av_get_media_type_string(type));
            return ret;
        }

        /* 打开解码器 */
        if ((ret = avcodec_open2(*dec_ctx, dec, NULL)) < 0) {
            fprintf(stderr, "Failed to open %s codec\n",
                    av_get_media_type_string(type));
            return ret;
        }
        //stream_index回传
        *stream_idx = stream_index;
    }

    return 0;
}
```

1. 获取AVStream

2. 从AVStream读取解码信息，创建AVCodecContext

3. 给AVCodecContext配置参数

4. 打开解码器

#### decode_packet

```c
static int decode_packet(AVCodecContext *dec, const AVPacket *pkt)
{
    int ret = 0;

    // submit the packet to the decoder
    ret = avcodec_send_packet(dec, pkt);
    if (ret < 0) {
        fprintf(stderr, "Error submitting a packet for decoding (%s)\n", av_err2str(ret));
        return ret;
    }

    // get all the available frames from the decoder
    while (ret >= 0) {
        ret = avcodec_receive_frame(dec, frame);
        if (ret < 0) {
            // those two return values are special and mean there is no output
            // frame available, but there were no errors during decoding
            if (ret == AVERROR_EOF || ret == AVERROR(EAGAIN))
                return 0;

            fprintf(stderr, "Error during decoding (%s)\n", av_err2str(ret));
            return ret;
        }

        // write the frame data to output file
        if (dec->codec->type == AVMEDIA_TYPE_VIDEO)
            ret = output_video_frame(frame);
        else
            ret = output_audio_frame(frame);

        av_frame_unref(frame);
        if (ret < 0)
            return ret;
    }

    return 0;
}
```

1. 调用avcodec_send_packet给解码器送pkt

2. 调用avcodec_receive_frame从解码器读frame

3. 调用output_video_frame将解码后视频写文件，调用output_audio_frame将解码后音频写文件

#### output_video_frame

```c
static int output_video_frame(AVFrame *frame)
{
    //解码中，发现宽高或者格式变了，报错
    if (frame->width != width || frame->height != height ||
        frame->format != pix_fmt) {
        /* To handle this change, one could call av_image_alloc again and
         * decode the following frames into another rawvideo file. */
        fprintf(stderr, "Error: Width, height and pixel format have to be "
                "constant in a rawvideo file, but the width, height or "
                "pixel format of the input video changed:\n"
                "old: width = %d, height = %d, format = %s\n"
                "new: width = %d, height = %d, format = %s\n",
                width, height, av_get_pix_fmt_name(pix_fmt),
                frame->width, frame->height,
                av_get_pix_fmt_name(frame->format));
        return -1;
    }
    printf("video_frame n:%d coded_n:%d\n",
           video_frame_count++, frame->coded_picture_number);
    /*
     从frame中读取解码后的数据，拷贝到之前申请的buffer中
     调用av_image_copy是为了去除frame中可能的字节对齐的数据
     写入文件中的数据，要求不含有字节对齐的数据
    */

    av_image_copy(video_dst_data, video_dst_linesize,
                  (const uint8_t **)(frame->data), frame->linesize,
                  pix_fmt, width, height);

    /* write to rawvideo file */
    fwrite(video_dst_data[0], 1, video_dst_bufsize, video_dst_file);
    return 0;
}
```

1. 判断解码后的宽高，格式是否变更，写入文件的宽高，格式应该是一致的，如果变更就报错

2. 将frame中的数据拷贝到之前申请的buffer中，拷贝的时候，去除字节对齐数据

3. 将buffer中的数据写入文件

#### output_audio_frame

```c
static int output_audio_frame(AVFrame *frame)
{
    size_t unpadded_linesize = frame->nb_samples * av_get_bytes_per_sample(frame->format);
    printf("audio_frame n:%d nb_samples:%d pts:%s\n",
           audio_frame_count++, frame->nb_samples,
           av_ts2timestr(frame->pts, &audio_dec_ctx->time_base));

    /* Write the raw audio data samples of the first plane. This works
     * fine for packed formats (e.g. AV_SAMPLE_FMT_S16). However,
     * most audio decoders output planar audio, which uses a separate
     * plane of audio samples for each channel (e.g. AV_SAMPLE_FMT_S16P).
     * In other words, this code will write only the first audio channel
     * in these cases.
     * You should use libswresample or libavfilter to convert the frame
     * to packed data. */

    /*
    只写了第一个声道的数据，如果是平面多声道，使用libswresample或libavfilter将其转化为交错类型的音频再写入文件
    */
    fwrite(frame->extended_data[0], 1, unpadded_linesize, audio_dst_file);

    return 0;
}
```

1. 将frame中的音频的第一个声道数据写入文件

2. 如果想写入多声道，需要通过libswresample或libavfilter转为交错型的再写入文件
   
   
   
   ---

参考了： [FFmpeg 封装、解封装及解码的流程简介_myvest的专栏-CSDN博客_ffmpeg 封装流程](https://blog.csdn.net/myvest/article/details/89254452)


