---
layout: post
title: "ffmpeg example 4.视频文件封装和编码"
date: 2022-03-12 
tag: ffmpeg
---



今天学习 `ffmpeg/doc/examples/muxing.c`



该程序接受一个参数，指定输出的文件的路径，例如`/tmp/mux.mp4`,`/tmp/mux.mov`。 文件名的后缀会用来推测生成的AVFormatContext的格式，如果没有指定，就使用`mpeg`。使用fmt 默认的视频编码器和音频编码器，编码10秒钟的音视频数据，交替写入文件。



操作封装需要操作`AVFormatContext`

## 创建AVFormatContext

```c
    //创建AVFormatContext， 根据文件后缀来推测output format
    avformat_alloc_output_context2(&oc, NULL, NULL, filename);
    if (!oc) {
        printf("Could not deduce output format from file extension: using MPEG.\n");
        //无法推测output format， 使用mpeg
        avformat_alloc_output_context2(&oc, NULL, "mpeg", filename);
    }
```

## 给AVFormatContext添加 video / audio stream

```c
    if (fmt->video_codec != AV_CODEC_ID_NONE) {
        add_stream(&video_st, oc, &video_codec, fmt->video_codec);
        have_video = 1;
        encode_video = 1;
    }
    if (fmt->audio_codec != AV_CODEC_ID_NONE) {
        add_stream(&audio_st, oc, &audio_codec, fmt->audio_codec);
        have_audio = 1;
        encode_audio = 1;
    }
```

我们看看add_stream做了什么

```c

/* Add an output stream. */
static void add_stream(OutputStream *ost, AVFormatContext *oc,
                       const AVCodec **codec,
                       enum AVCodecID codec_id)
{
    AVCodecContext *c;
    int i;
    /* find the encoder */
    //找到codec_id对应的编码器AVCodec
    *codec = avcodec_find_encoder(codec_id);
    //创建pkt
    ost->tmp_pkt = av_packet_alloc();
    //创建AVStream
    ost->st = avformat_new_stream(oc, NULL);
    //设置stream的index
    ost->st->id = oc->nb_streams-1;
    //创建编码器上下文
    c = avcodec_alloc_context3(*codec);
    //保存编码器上下文
    ost->enc = c;

    switch ((*codec)->type) {
    case AVMEDIA_TYPE_AUDIO:
         //设置音频编码器上下文参数(码率，采样率，位深，声道布局等)
              ...
        //设置stream的时间基
        ost->st->time_base = (AVRational){ 1, c->sample_rate };
        break;

    case AVMEDIA_TYPE_VIDEO:
        //设置编码器上下文的参数
        c->codec_id = codec_id;
        //设置stream的时间基
        ost->st->time_base = (AVRational){ 1, STREAM_FRAME_RATE };
        c->time_base       = ost->st->time_base;
        //编码器码率，帧率，gop，分辨率, 设置
        ...
        break;

    default:
        break;
    }
    /* Some formats want stream headers to be separate. */
    //处理一下stream header
    if (oc->oformat->flags & AVFMT_GLOBALHEADER)
        c->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
}
```



1. 根据codec_id找到AVCodec

2. 调用avformat_new_stream创建stream

3. 设置stream的index

4. 根据AVCodec创建编码器的上下文，配置编码器参数

5. 设置stream的time_base

6.  处理一下 stream headers 的标志位



## 音视频流创建好了，写一步为写入准备

1. 上面创建好了stream, 创建了编码器上下文。open_video/open_audio继续为写入做准备

2. 准备完成就打开文件准备写入

```c
    /* Now that all the parameters are set, we can open the audio and
     * video codecs and allocate the necessary encode buffers. */
    if (have_video)
        open_video(oc, video_codec, &video_st, opt);

    if (have_audio)
        open_audio(oc, audio_codec, &audio_st, opt);

    //打印oc的信息
    av_dump_format(oc, 0, filename, 1);

    /* open the output file, if needed */
    if (!(fmt->flags & AVFMT_NOFILE)) {
        //打开文件
        ret = avio_open(&oc->pb, filename, AVIO_FLAG_WRITE);
        if (ret < 0) {
            fprintf(stderr, "Could not open '%s': %s\n", filename,
                    av_err2str(ret));
            return 1;
        }
    }
```

看看open_video 做了什么

```c
static void open_video(AVFormatContext *oc, const AVCodec *codec,
                       OutputStream *ost, AVDictionary *opt_arg)
{
    int ret;
    AVCodecContext *c = ost->enc;
    AVDictionary *opt = NULL;
    //将opt_arg中的内容拷贝到opt中
    av_dict_copy(&opt, opt_arg, 0);
    /* open the codec */
    //打开编码器
    ret = avcodec_open2(c, codec, &opt);
    //释放opt
    av_dict_free(&opt);
    if (ret < 0) {
        fprintf(stderr, "Could not open video codec: %s\n", av_err2str(ret));
        exit(1);
    }

    /* allocate and init a re-usable frame */
    //根据格式，宽高，创建一个复用的AVFrame
    ost->frame = alloc_picture(c->pix_fmt, c->width, c->height);
    if (!ost->frame) {
        fprintf(stderr, "Could not allocate video frame\n");
        exit(1);
    }

    /* If the output format is not YUV420P, then a temporary YUV420P
     * picture is needed too. It is then converted to the required
     * output format. */
    ost->tmp_frame = NULL;
    if (c->pix_fmt != AV_PIX_FMT_YUV420P) {
        //如果编码器对应的pix_fmt不是yuv420p， 创建一个yuv420p格式的AVFrame，保存在ost->tmp_frame中
        ost->tmp_frame = alloc_picture(AV_PIX_FMT_YUV420P, c->width, c->height);
        if (!ost->tmp_frame) {
            fprintf(stderr, "Could not allocate temporary picture\n");
            exit(1);
        }
    }

    /* copy the stream parameters to the muxer */
    //将编码器的参数拷贝到stream对应的编码参数中
    ret = avcodec_parameters_from_context(ost->st->codecpar, c);
    if (ret < 0) {
        fprintf(stderr, "Could not copy the stream parameters\n");
        exit(1);
    }
}
```

1.  打开编码器

2. 申请资源，创建一个AVFrame用于存储编码前数据

3. 调用avcodec_parameters_from_context将编码器的编码参数拷贝到stream的codecpar中

## 写音视频数据到文件

写文件头

```c
    /* Write the stream header, if any. */
    //将流信息写文件头
    ret = avformat_write_header(oc, &opt);
    if (ret < 0) {
        fprintf(stderr, "Error occurred when opening output file: %s\n",
                av_err2str(ret));
        return 1;
    }
```

交替写音视频帧

```c
    while (encode_video || encode_audio) {
        /* select the stream to encode */
        /*
         交替写入编码后的音频和视频帧
         视频写入结束或者video_st.next_pts <= audio_st.next_pts, 写视频
         否则写音频
        */
        if (encode_video &&
            (!encode_audio || av_compare_ts(video_st.next_pts, video_st.enc->time_base,
                                            audio_st.next_pts, audio_st.enc->time_base) <= 0)) {
            //写入编码后的视频帧
            encode_video = !write_video_frame(oc, &video_st);
        } else {
            //写入编码后的音频帧
            encode_audio = !write_audio_frame(oc, &audio_st);
        }
    }
```

 写trailer

```c
    /* Write the trailer, if any. The trailer must be written before you
     * close the CodecContexts open when you wrote the header; otherwise
     * av_write_trailer() may try to use memory that was freed on
     * av_codec_close(). */
    av_write_trailer(oc);
```

关闭编码器，关闭文件，释放资源

```c
    /* Close each codec. */
    if (have_video)
        close_stream(oc, &video_st);
    if (have_audio)
        close_stream(oc, &audio_st);

    if (!(fmt->flags & AVFMT_NOFILE))
        /* Close the output file. */
        avio_closep(&oc->pb);

    /* free the stream */
    avformat_free_context(oc);
```

### write_video_frame

```
static int write_video_frame(AVFormatContext *oc, OutputStream *ost)
{
    return write_frame(oc, ost->enc, ost->st, get_video_frame(ost), ost->tmp_pkt);
}
```

只是简单调用了write_frame

```c
static int write_frame(AVFormatContext *fmt_ctx, AVCodecContext *c,
                       AVStream *st, AVFrame *frame, AVPacket *pkt)
{
    int ret;

    // send the frame to the encoder
    //将frame送给编码器去编码
    ret = avcodec_send_frame(c, frame);
    if (ret < 0) {
        fprintf(stderr, "Error sending a frame to the encoder: %s\n",
                av_err2str(ret));
        exit(1);
    }

    while (ret >= 0) {
        //从编码器中读出编码后的pkt
        ret = avcodec_receive_packet(c, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF)
            break;
        else if (ret < 0) {
            fprintf(stderr, "Error encoding a frame: %s\n", av_err2str(ret));
            exit(1);
        }

        /* rescale output packet timestamp values from codec to stream timebase */
        //调整pkt的pts，pkt的时间基参编码器的时间基，将其转换为参考stream的时间基
        av_packet_rescale_ts(pkt, c->time_base, st->time_base);
        //设置pkt的stream_index和stream对应的一致，音视频分别对应于不同的stream_index
        pkt->stream_index = st->index;

        /* Write the compressed frame to the media file. */
        log_packet(fmt_ctx, pkt);
        //将pkt写入视频文件
        ret = av_interleaved_write_frame(fmt_ctx, pkt);
        /* pkt is now blank (av_interleaved_write_frame() takes ownership of
         * its contents and resets pkt), so that no unreferencing is necessary.
         * This would be different if one used av_write_frame(). */
        if (ret < 0) {
            fprintf(stderr, "Error while writing output packet: %s\n", av_err2str(ret));
            exit(1);
        }
    }

    return ret == AVERROR_EOF ? 1 : 0;
}
```

1. 将AVFrame送给编码器去编码

2. 读取pkt

3. 调用av_packet_rescale_ts，调整pkt的时间戳，写入文件pkt的pts要以stream的time_base为基准

4. 设置pkt的index

5. 调用av_interleaved_write_frame将pkt写入文件

6. 返回写入结果。当AVFrame为空时，会冲洗编码器，ret = AVERROR_EOF， 返回1， 结束写入



frame的每一帧数据，是来自于get_video_frame方法, 填充的假数据

```c
static AVFrame *get_video_frame(OutputStream *ost)
{
    AVCodecContext *c = ost->enc;

    /* check if we want to generate more frames */
    if (av_compare_ts(ost->next_pts, c->time_base,
                      STREAM_DURATION, (AVRational){ 1, 1 }) > 0)
        return NULL;

    /* when we pass a frame to the encoder, it may keep a reference to it
     * internally; make sure we do not overwrite it here */
    if (av_frame_make_writable(ost->frame) < 0)
        exit(1);

    if (c->pix_fmt != AV_PIX_FMT_YUV420P) {
        /* as we only generate a YUV420P picture, we must convert it
         * to the codec pixel format if needed */
        if (!ost->sws_ctx) {
            ost->sws_ctx = sws_getContext(c->width, c->height,
                                          AV_PIX_FMT_YUV420P,
                                          c->width, c->height,
                                          c->pix_fmt,
                                          SCALE_FLAGS, NULL, NULL, NULL);
            if (!ost->sws_ctx) {
                fprintf(stderr,
                        "Could not initialize the conversion context\n");
                exit(1);
            }
        }
        fill_yuv_image(ost->tmp_frame, ost->next_pts, c->width, c->height);
        sws_scale(ost->sws_ctx, (const uint8_t * const *) ost->tmp_frame->data,
                  ost->tmp_frame->linesize, 0, c->height, ost->frame->data,
                  ost->frame->linesize);
    } else {
        fill_yuv_image(ost->frame, ost->next_pts, c->width, c->height);
    }

    ost->frame->pts = ost->next_pts++;

    return ost->frame;
}
```

1. 调用av_compare_ts 判断是否继续生成新的frame，一开始规定了只写10秒钟的数据，超过了就不写了

2. av_frame_make_writable使当前的frame可写，被编码器引用的frame不可写，调用该方法如果被引用，内部会创建新buf，变成可写的

3. 填充数据yuv，还做了缩放处理，暂不讨论

4. 更新frame的pts

5. 返回生成的frame





write_audio_frame

```c
/*
 * encode one audio frame and send it to the muxer
 * return 1 when encoding is finished, 0 otherwise
 */
static int write_audio_frame(AVFormatContext *oc, OutputStream *ost)
{
    AVCodecContext *c;
    AVFrame *frame;
    int ret;
    int dst_nb_samples;

    c = ost->enc;

    //获取音频帧
    frame = get_audio_frame(ost);   

    if (frame) {
        /* convert samples from native format to destination codec format, using the resampler */
        /* compute destination number of samples */

        /*
        计算根据重采样后应该生成的采样个数
        */
        dst_nb_samples = av_rescale_rnd(swr_get_delay(ost->swr_ctx, c->sample_rate) + frame->nb_samples,
                                        c->sample_rate, c->sample_rate, AV_ROUND_UP);
        //由于没有修改采样率，只是修改了位深，采样个数保持不变
        av_assert0(dst_nb_samples == frame->nb_samples);

        /* when we pass a frame to the encoder, it may keep a reference to it
         * internally;
         * make sure we do not overwrite it here
         */
        //使ost->frame可写
        ret = av_frame_make_writable(ost->frame);
        if (ret < 0)
            exit(1);

        /* convert to destination format */
        //重采样
        ret = swr_convert(ost->swr_ctx,
                          ost->frame->data, dst_nb_samples,
                          (const uint8_t **)frame->data, frame->nb_samples);
        if (ret < 0) {
            fprintf(stderr, "Error while converting\n");
            exit(1);
        }

        frame = ost->frame;
        //重新计算音频pts
        frame->pts = av_rescale_q(ost->samples_count, (AVRational){1, c->sample_rate}, c->time_base);
        //计算samples_count
        ost->samples_count += dst_nb_samples;
    }
    //将音频帧写入文件
    return write_frame(oc, c, ost->st, frame, ost->tmp_pkt);
}
```

1. 准备AVFrame，调用get_audio_frame获取一个AVFrame，内部根据编码格式，填充pcm假数据

2. 调用av_rescale_rnd计算重采样个数，如果数据源和送入编码器的音频的采样率不同，需要转换采样率，示例程序只是变了采样格式，没有更改采样率，采样个数不变

3. 做重采样，重采样数据保存在ost->frame中

4. 重采样后，需要更新frame的pts

5. 调用write_frame编码，将数据写入文件



## 总结：

学习了通过应用libavformat将音视频数据编码封装到文件中

1. 创建AVFormatContext

2. 添加stream

3. 配置编解码器，stream 参数

4. 编码frame，生成pkt，更新pts

5. 交替写音视频pkt

6. 关闭编解码器，结束写文件



# 
















