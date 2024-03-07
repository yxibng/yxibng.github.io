---
layout: post
title: "ffplay read_thread 分析"
date: 2022-03-20
tag: ffmpeg

---


参考： [ffplay read线程分析](https://zhuanlan.zhihu.com/p/43672062)

> ffplay main 函数 做了什么

1. 参数验证与解析

2. 注册codecs， demux， protocols

3. sdl 初始化，创建窗口

4. 调用stream_open打开流

5. 调用event_loop进入运行循环

> stream_open 做了什么

    主要是初始化VideoState *is，填充关键信息

1. 初始化，分配内存`is = av_mallocz(sizeof(VideoState));`

2. 调用frame_queue_init给VideoState对应的音频，视频，字幕对应Frame队列初始化分配内存

3. 调用packet_queue_init给VideoState对应的音频，视频，字幕对应Packet队列初始化分配内存

4. 创建条件变量continue_read_thread， 用于控制是否继续读取或者等待

5. 调用init_clock 初始化音频，视频，外部时钟

6. 设置同步类型av_sync_type

7. 创建并开启read_thread

## read_thread

分为两个阶段：

1. 准备阶段

2. 循环读pkt

准备阶段：

stream_open 对VideoState *is 做了初始化关键参数的填充。read_thread 在这个基础上，打开输入的流，解封装，读取流的信息，找到音频，视频，字幕对应的stream，读取解码参数，创建解码器，开启解码器。分别为音频，视频，字幕开启创建解码线程。

循环读pkt：

然后进入循环，从流中读取pkt，根据同步时钟，放入pkt队列或者丢弃。如果读结束，给pkt队列放入空包，用于冲洗解码器。

循环中还要处理终止暂停恢复事件，seek事件，根据队列的状态（是否有足够的数据）控制等待还是继续读取新的pkt。

### 准备阶段

打开文件，解封装，获取文件信息

```c
VideoState *is = arg;
AVFormatContext *ic = NULL;
//创建AVFormatContext
ic = avformat_alloc_context();
//interrupt_callback用于ffmpeg内部在执行耗时操作时检查是否有退出请求，并提前中断，避免用户退出请求没有及时响应
ic->interrupt_callback.callback = decode_interrupt_cb;
ic->interrupt_callback.opaque = is;
//特定选项处理
if (!av_dict_get(format_opts, "scan_all_pmts", NULL, AV_DICT_MATCH_CASE)) {
    av_dict_set(&format_opts, "scan_all_pmts", "1", AV_DICT_DONT_OVERWRITE);
    scan_all_pmts_set = 1;
}
//打开输入的流，读取流的头部信息
err = avformat_open_input(&ic, is->filename, is->iformat, &format_opts);
//保存AVFormatContext
is->ic = ic;
if (find_stream_info) {
    //如果文件不包含头部信息(如ts)，通过读取一段文件分析后得到流信息
    err = avformat_find_stream_info(ic, opts);
}
```

判断是否是实时流

```c
//是否是实时流rtp/rtsp/sdp等
is->realtime = is_realtime(ic);
```

is_realtime 函数

```c
static int is_realtime(AVFormatContext *s)
{
    if(   !strcmp(s->iformat->name, "rtp")
       || !strcmp(s->iformat->name, "rtsp")
       || !strcmp(s->iformat->name, "sdp")
    )
        return 1;

    if(s->pb && (   !strncmp(s->url, "rtp:", 4)
                 || !strncmp(s->url, "udp:", 4)
                )
    )
        return 1;
    return 0;
}
```

选择音频，视频，字幕流。实际操作中，选择的策略很多，一般根据具体需求来定——比如可以是选择最高清的视频流；选择本地语言的音频流；直接选择第一条视频、音频轨道；等等。

ffplay主要是通过`av_find_best_stream`来选择：

```c
    //如果用户通过wanted_stream_spec指定了流，找到用户选择的流
    for (i = 0; i < ic->nb_streams; i++) {
        AVStream *st = ic->streams[i];
        enum AVMediaType type = st->codecpar->codec_type;
        st->discard = AVDISCARD_ALL;
        if (type >= 0 && wanted_stream_spec[type] && st_index[type] == -1)
            if (avformat_match_stream_specifier(ic, st, wanted_stream_spec[type]) > 0)
                st_index[type] = i;
    }
    for (i = 0; i < AVMEDIA_TYPE_NB; i++) {
        if (wanted_stream_spec[i] && st_index[i] == -1) {
            //处理找不到用户选择的流的情况
            av_log(NULL, AV_LOG_ERROR, "Stream specifier %s does not match any %s stream\n", wanted_stream_spec[i], av_get_media_type_string(i));
            st_index[i] = INT_MAX;
        }
    }

    //获取video stream
    if (!video_disable)
        st_index[AVMEDIA_TYPE_VIDEO] =
            av_find_best_stream(ic, AVMEDIA_TYPE_VIDEO,
                                st_index[AVMEDIA_TYPE_VIDEO], -1, NULL, 0);
    //获取audio stream，参考视频流选择
    if (!audio_disable)
        st_index[AVMEDIA_TYPE_AUDIO] =
            av_find_best_stream(ic, AVMEDIA_TYPE_AUDIO,
                                st_index[AVMEDIA_TYPE_AUDIO],
                                st_index[AVMEDIA_TYPE_VIDEO],
                                NULL, 0);
    //获取subtitle stream，优先参考音频流
    if (!video_disable && !subtitle_disable)
        st_index[AVMEDIA_TYPE_SUBTITLE] =
            av_find_best_stream(ic, AVMEDIA_TYPE_SUBTITLE,
                                st_index[AVMEDIA_TYPE_SUBTITLE],
                                (st_index[AVMEDIA_TYPE_AUDIO] >= 0 ?
                                 st_index[AVMEDIA_TYPE_AUDIO] :
                                 st_index[AVMEDIA_TYPE_VIDEO]),
                                NULL, 0);
```

wanted_stream_spec通过main函数传参设定，格式可以有很多种，参考[官方文档](https://www.ffmpeg.org/ffplay.html#Stream-specifiers-1)

如果用户没有指定流，或指定部分流，或指定流不存在，则主要由av_find_best_stream发挥作用。

```c
int av_find_best_stream(AVFormatContext *ic,
                        enum AVMediaType type,//要选择的流类型
                        int wanted_stream_nb,//目标流索引
                        int related_stream,//参考流索引
                        AVCodec **decoder_ret,
                        int flags);
```

如果指定了正确的wanted_stream_nb，一般情况都是直接返回该指定流，即用户选择的流。如果指定了参考流，且未指定目标流的情况，会根据参考流去查找所需类型的流，但一般结果，都是返回该类型第一个流。

已经获取了流信息，下一步就是创建解码器，开启解码线程。 

主要在`stream_component_open`方法中实现, 简化代码如下

```c
static int stream_component_open(VideoState *is, int stream_index)
{
    //创建解码器上下文
    avctx = avcodec_alloc_context3(NULL);        
    //填充解码参数
    ret = avcodec_parameters_to_context(avctx, ic->streams[stream_index]->codecpar);
    //设置解码器的时间基，等于stream的时间基
    avctx->pkt_timebase = ic->streams[stream_index]->time_base;
    //找解码器
    codec = avcodec_find_decoder(avctx->codec_id);
    if (forced_codec_name)
        //如果用户指定了解码器，使用用户指定的解码器
        codec = avcodec_find_decoder_by_name(forced_codec_name);
    //打开解码器
    if ((ret = avcodec_open2(avctx, codec, &opts)) < 0) {
        goto fail;
    }
    switch (avctx->codec_type) {
    case AVMEDIA_TYPE_AUDIO:
        //打开音频播放器
        if ((ret = audio_open(is, channel_layout, nb_channels, sample_rate, &is->audio_tgt)) < 0)
            goto fail;
        //给is->auddec初始化
        if ((ret = decoder_init(&is->auddec, avctx, &is->audioq, is->continue_read_thread)) < 0)
            goto fail;
        //开启音频解码线程
        if ((ret = decoder_start(&is->auddec, audio_thread, "audio_decoder", is)) < 0)
            goto out;
        //暂停音频播放器
        SDL_PauseAudioDevice(audio_dev, 0);
        break;
    case AVMEDIA_TYPE_VIDEO:
        is->video_stream = stream_index;
        is->video_st = ic->streams[stream_index];
        //给is->viddec初始化
        if ((ret = decoder_init(&is->viddec, avctx, &is->videoq, is->continue_read_thread)) < 0)
            goto fail;
        //开启视频解码线程
        if ((ret = decoder_start(&is->viddec, video_thread, "video_decoder", is)) < 0)
            goto out;
        is->queue_attachments_req = 1;
        break;
    case AVMEDIA_TYPE_SUBTITLE:
        is->subtitle_stream = stream_index;
        is->subtitle_st = ic->streams[stream_index];
        //初始化字幕解码
        if ((ret = decoder_init(&is->subdec, avctx, &is->subtitleq, is->continue_read_thread)) < 0)
            goto fail;
        //开启字幕解码线程
        if ((ret = decoder_start(&is->subdec, subtitle_thread, "subtitle_decoder", is)) < 0)
            goto out;
        break;
    }
    //....
    return ret;
}
```

针对音频，需要另外处理音频播放器的初始化，暂停状态。

对音频，视频，字幕，调用`decoder_init`初始化Decoder， 调用`decoder_start`开启对应的解码线程。

decoder_init

```
static int decoder_init(Decoder *d, AVCodecContext *avctx, PacketQueue *queue, SDL_cond *empty_queue_cond) {
    memset(d, 0, sizeof(Decoder));
    d->pkt = av_packet_alloc();
    if (!d->pkt)
        return AVERROR(ENOMEM);
    d->avctx = avctx;
    d->queue = queue;
    d->empty_queue_cond = empty_queue_cond;
    d->start_pts = AV_NOPTS_VALUE;
    d->pkt_serial = -1;
    return 0;
}
```

decoder_start

```
static int decoder_start(Decoder *d, int (*fn)(void *), const char *thread_name, void* arg)
{
    //开启packet queue
    packet_queue_start(d->queue);
    //开启解码线程
    d->decoder_tid = SDL_CreateThread(fn, thread_name, arg);
    if (!d->decoder_tid) {
        av_log(NULL, AV_LOG_ERROR, "SDL_CreateThread(): %s\n", SDL_GetError());
        return AVERROR(ENOMEM);
    }
    return 0;
}
```

### 主循环读包

简化一下如下

```
for (;;) {
        if (is->abort_request)
            break;//处理退出消息
        if (is->paused != is->last_paused) {
            //处理暂停与恢复
            //.......
        }

        if (is->seek_req) {
            //处理seek操作
            ret = avformat_seek_file(is->ic, -1, seek_min, seek_target, seek_max, is->seek_flags);
        }
        /*
        控制队列大小
        */
        if (infinite_buffer<1 &&
              (is->audioq.size + is->videoq.size + is->subtitleq.size > MAX_QUEUE_SIZE
            || (stream_has_enough_packets(is->audio_st, is->audio_stream, &is->audioq) &&
                stream_has_enough_packets(is->video_st, is->video_stream, &is->videoq) &&
                stream_has_enough_packets(is->subtitle_st, is->subtitle_stream, &is->subtitleq)))) {
            /* wait 10 ms */
            SDL_LockMutex(wait_mutex);
            SDL_CondWaitTimeout(is->continue_read_thread, wait_mutex, 10);
            SDL_UnlockMutex(wait_mutex);
            continue;
        }
        //处理循环播放
        if (!is->paused &&
            (!is->audio_st || (is->auddec.finished == is->audioq.serial && frame_queue_nb_remaining(&is->sampq) == 0)) &&
            (!is->video_st || (is->viddec.finished == is->videoq.serial && frame_queue_nb_remaining(&is->pictq) == 0))) {
            if (loop != 1 && (!loop || --loop)) {
                stream_seek(is, start_time != AV_NOPTS_VALUE ? start_time : 0, 0, 0);
            } else if (autoexit) {
                ret = AVERROR_EOF;
                goto fail;
            }
        }
        //读pkt
        ret = av_read_frame(ic, pkt);

        //在播放区间，放入队列
        packet_queue_put(&is->videoq, pkt);
        //不在播放区间，丢弃
        av_packet_unref(pkt);

    }
```

主要的代码就`av_read_frame`和`packet_queue_put`，`av_read_frame`从文件中读取视频数据，并获取一个AVPacket，`packet_queue_put`把它放入到对应的PacketQueue中。

当然，读取过程还会有seek、pause、resume、abort等事件，所以有专门的分支处理这些请求。

PacketQueue默认情况下会有大小限制，达到这个大小后，就需要等待10ms，以让消费者——解码线程能有时间消耗。

播放完成后，会根据loop的设置决定是否循环。

暂停/恢复的处理：

```c
if (is->paused != is->last_paused) {
    //更新paused状态
    is->last_paused = is->paused;
    if (is->paused)
        //暂停
        is->read_pause_return = av_read_pause(ic);
    else
        //恢复播放
        av_read_play(ic);
}
```

ffmpeg有专门针对暂停和恢复的函数，所以直接调用就可以了。

> av_read_pause和av_read_play对于URLProtocol，会调用其url_read_pause，通过参数区分是要暂停还是恢复。对于AVInputFormat会调用其read_pause和read_play.  
> 一般情况下URLProtocol和AVInputFormat都不需要专门处理暂停和恢复，但对于像rtsp/rtmp这种在通讯协议上支持(需要)暂停、恢复的就特别有用了。

对于seek的处理，会比暂停/恢复略微复杂一些：

```c
if (is->seek_req) {
    //处理seek操作
    int64_t seek_target = is->seek_pos;
    int64_t seek_min    = is->seek_rel > 0 ? seek_target - is->seek_rel + 2: INT64_MIN;
    int64_t seek_max    = is->seek_rel < 0 ? seek_target - is->seek_rel - 2: INT64_MAX;
// FIXME the +-2 is due to rounding being not done in the correct direction in generation
//      of the seek_pos/seek_rel variables
    //seek到正确的位置
    ret = avformat_seek_file(is->ic, -1, seek_min, seek_target, seek_max, is->seek_flags);
    if (ret < 0) {
        av_log(NULL, AV_LOG_ERROR,
               "%s: error while seeking\n", is->ic->url);
    } else {
        if (is->audio_stream >= 0)
            //清空音频帧队列
            packet_queue_flush(&is->audioq);
        if (is->subtitle_stream >= 0)
            //清空字幕帧队列
            packet_queue_flush(&is->subtitleq);
        if (is->video_stream >= 0)
            //清空视频帧队列
            packet_queue_flush(&is->videoq);
        //更新clock
        if (is->seek_flags & AVSEEK_FLAG_BYTE) {
           set_clock(&is->extclk, NAN, 0);
        } else {
           set_clock(&is->extclk, seek_target / (double)AV_TIME_BASE, 0);
        }
    }
    is->seek_req = 0;
    is->queue_attachments_req = 1;
    is->eof = 0;
    if (is->paused)
        step_to_next_frame(is);
}
```

主要的seek操作通过avformat_seek_file完成。根据avformat_seek_file的返回值，如果seek成功，需要：

1. 清除PacketQueue的缓存，并放入一个flush_pkt。放入的flush_pkt可以让PacketQueue的serial增1，以区分seek前后的数据
2. 同步外部时钟。在后续音视频同步的文章中再具体分析。

最后清理一些变量，并：

1. 设置queue_attachments_req以显示attachment画面
2. 如果当前是暂停状态，就跳到seek后的下一帧，以直观体现seek成功了

step_to_next_frame

```
static void step_to_next_frame(VideoState *is)
{
    /* if the stream is paused unpause it, then step */
    if (is->paused)
        stream_toggle_pause(is);
    is->step = 1;
}
```

原代码的注释比较清晰了——先取消暂停，然后执行step。当设置step为1后，显示线程会显示出一帧画面，然后再次进入暂停：

```
//in video_refresh
if (is->step && !is->paused)
    stream_toggle_pause(is);
```

这样seek的处理就完成了。

前面seek、暂停、恢复都可以通过调用ffmpeg的函数，辅助一些流程控制完成封装。

而读取缓冲区的控制可以说是ffplay原生的特性了。

是否需要控制缓冲区大小由变量infinite_buffer决定。infinite_buffer为1表示当前buffer无限大，不需要使用缓冲区限制策略。

infinite_buffer是可选选项，但在文件是实时协议时，且用户未指定时，这个值会被强制为1：

```c
static int is_realtime(AVFormatContext *s)
{
    if(   !strcmp(s->iformat->name, "rtp")
       || !strcmp(s->iformat->name, "rtsp")
       || !strcmp(s->iformat->name, "sdp")
    )
        return 1;

    if(s->pb && (   !strncmp(s->url, "rtp:", 4)
                 || !strncmp(s->url, "udp:", 4)
                )
    )
        return 1;
    return 0;
}

……
is->realtime = is_realtime(ic);
……
if (infinite_buffer < 0 && is->realtime)
    infinite_buffer = 1;
```

我们看下需控制缓冲区大小的情况：

```c
if (infinite_buffer<1 &&
    (is->audioq.size + is->videoq.size + is->subtitleq.size > MAX_QUEUE_SIZE
    || (stream_has_enough_packets(is->audio_st, is->audio_stream, &is->audioq) &&
        stream_has_enough_packets(is->video_st, is->video_stream, &is->videoq) &&
        stream_has_enough_packets(is->subtitle_st, is->subtitle_stream, &is->subtitleq)))) {
    /* wait 10 ms */
    SDL_LockMutex(wait_mutex);
    SDL_CondWaitTimeout(is->continue_read_thread, wait_mutex, 10);
    SDL_UnlockMutex(wait_mutex);
    continue;
}
```

缓冲区满有两种可能：

1. audioq，videoq，subtitleq三个PacketQueue的总字节数达到了MAX_QUEUE_SIZE（15M）
2. 音频、视频、字幕流都已有够用的包（stream_has_enough_packets）

第一种好理解，看下第二种中的stream_has_enough_packets：

```c
static int stream_has_enough_packets(AVStream *st, int stream_id, PacketQueue *queue) {
    return stream_id < 0 ||
           queue->abort_request ||
           (st->disposition & AV_DISPOSITION_ATTACHED_PIC) ||
           queue->nb_packets > MIN_FRAMES && (!queue->duration || av_q2d(st->time_base) * queue->duration > 1.0);
}
```

在满足PacketQueue总时长为0，或总时长超过1s的前提下：

有这么几种情况包是够用的：

1. 流没有打开（stream_id < 0）
2. 有退出请求（queue->abort_request）
3. 配置了AV_DISPOSITION_ATTACHED_PIC？（这个还不理解，后续分析attachement时回头看看）
4. 队列内包个数大于MIN_FRAMES（=25）

挺饶地，没有深刻体会其设计用意，不评论。

上述的几种处理都还是在正常播放流程内，接下来是对播放已完成情况的处理。

```c
if (!is->paused &&
    (!is->audio_st || (is->auddec.finished == is->audioq.serial && frame_queue_nb_remaining(&is->sampq) == 0)) &&
    (!is->video_st || (is->viddec.finished == is->videoq.serial && frame_queue_nb_remaining(&is->pictq) == 0))) {
    if (loop != 1 && (!loop || --loop)) {
        stream_seek(is, start_time != AV_NOPTS_VALUE ? start_time : 0, 0, 0);
    } else if (autoexit) {
        ret = AVERROR_EOF;
        goto fail;
    }
}
```

这里判断播放已完成的条件依然很“ffplay”，需要满足：

1. 不在暂停状态
2. 音频未打开，或者打开了，但是解码已解码完毕，serial等于PacketQueue的serial，并且PacketQueue中没有节点了
3. 视频未打开，或者打开了，但是解码已解码完毕，serial等于PacketQueue的serial，并且PacketQueue中没有节点了

在确认已结束的情况下，用户有两个变量可以控制播放器行为：

1. loop: 控制播放次数（当前这次也算在内，也就是最小就是1次了），0表示无限次
2. autoexit：自动退出，也就是播放完成后自动退出。

loop条件简化的非常不友好，其意思是：如果loop==1，那么已经播了1次了，无需再seek重新播放；如果loop不是1，==0，随意，无限次循环；减1后还大于0（--loop），也允许循环。也就是：

```c
static int allow_loop() {
    if (loop == 1)
        return 0;

    if (loop == 0)
        return 1;

    --loop;
    if (loop > 0)
        return 1;

    return 0;
}
```

前面讲了很多读线程主循环内的处理，比如暂停、seek、结束loop处理等，接下来就看看真正读的代码：

```c
ret = av_read_frame(ic, pkt);
if (ret < 0) {
    //文件读取完了，调用packet_queue_put_nullpacket通知解码线程
    if ((ret == AVERROR_EOF || avio_feof(ic->pb)) && !is->eof) {
        if (is->video_stream >= 0)
            packet_queue_put_nullpacket(&is->videoq, is->video_stream);
        if (is->audio_stream >= 0)
            packet_queue_put_nullpacket(&is->audioq, is->audio_stream);
        if (is->subtitle_stream >= 0)
            packet_queue_put_nullpacket(&is->subtitleq, is->subtitle_stream);
        is->eof = 1;
    }
    //发生错误了，退出主循环
    if (ic->pb && ic->pb->error)
        break;

    //如果都不是，可能只是要等一等
    SDL_LockMutex(wait_mutex);
    SDL_CondWaitTimeout(is->continue_read_thread, wait_mutex, 10);
    SDL_UnlockMutex(wait_mutex);
    continue;
} else {
    is->eof = 0;
}

/* check if packet is in play range specified by user, then queue, otherwise discard */
stream_start_time = ic->streams[pkt->stream_index]->start_time;
pkt_ts = pkt->pts == AV_NOPTS_VALUE ? pkt->dts : pkt->pts;
pkt_in_play_range = duration == AV_NOPTS_VALUE ||
        (pkt_ts - (stream_start_time != AV_NOPTS_VALUE ? stream_start_time : 0)) *
        av_q2d(ic->streams[pkt->stream_index]->time_base) -
        (double)(start_time != AV_NOPTS_VALUE ? start_time : 0) / 1000000
        <= ((double)duration / 1000000);

//如果在时间范围内，那么根据stream_index，放入到视频、音频、会字幕的PacketQueue中
if (pkt->stream_index == is->audio_stream && pkt_in_play_range) {
    packet_queue_put(&is->audioq, pkt);
} else if (pkt->stream_index == is->video_stream && pkt_in_play_range
           && !(is->video_st->disposition & AV_DISPOSITION_ATTACHED_PIC)) {
    packet_queue_put(&is->videoq, pkt);
} else if (pkt->stream_index == is->subtitle_stream && pkt_in_play_range) {
    packet_queue_put(&is->subtitleq, pkt);
} else {
    av_packet_unref(pkt);
}
```

看起来很长，实际比上述各种特殊流程的处理都直白，主要为：

1. av_read_frame读取一个包(AVPacket)
2. 返回值处理
3. pkt_in_play_range计算
4. packet_queue_put放入各自队列，或者丢弃

步骤1、步骤2、步骤4，都比较直接，看注释即可。

这里看下pkt_in_play_range的计算，我们把以上代码分解下：

```c
int64_t get_stream_start_time(AVFormatContext* ic, int index) {
    int64_t stream_start_time = ic->streams[index]->start_time;
    return stream_start_time != AV_NOPTS_VALUE ? stream_start_time : 0;
}

int64_t get_pkt_ts(AVPacket* pkt) {//ts: timestamp（时间戳）的缩写
    return pkt->pts == AV_NOPTS_VALUE ? pkt->dts : pkt->pts;
}

double ts_as_second(int64_t ts，AVFormatContext* ic，int index) {
    return ts * av_q2d(ic->streams[index]->time_base);
} 

double get_ic_start_time(AVFormatContext* ic) {//ic中的时间单位是us
    return (start_time != AV_NOPTS_VALUE ? start_time : 0) / 1000000;
}
```

有了这些函数，就可以计算pkt_in_play_range了：

```c
int is_pkt_in_play_range(AVFormatContext* ic, AVPacket* pkt) {
    if (duration == AV_NOPTS_VALUE) //如果当前流无法计算总时长，按无限时长处理
        return 1;

    //计算pkt相对stream位置
    int64_t stream_ts = get_pkt_ts(pkt) - get_stream_start_time(ic, pkt->stream_index);
    double stream_ts_s = ts_as_second(stream_ts, ic, pkt->stream_index);

    //计算pkt相对ic位置
    double ic_ts = stream_ts_s - get_ic_start_time(ic);

    //是否在时间范围内
    return ic_ts <= ((double)duration / 1000000);
}
```
