---
layout: post
title: "ffplay video_thread 分析"
date: 2022-03-22
tag: ffmpeg

---

去除滤镜相关，简化为

```
static int video_thread(void *arg)
{
    for (;;) {
        //获取解码后的frame
        ret = get_video_frame(is, frame);
        if (ret < 0) //收到了退出请求，结束循环
            goto the_end;
        if (!ret)
            continue;
        //根据帧率，计算frame的播放持续时间
        duration = (frame_rate.num && frame_rate.den ? av_q2d((AVRational){frame_rate.den, frame_rate.num}) : 0);
        //根据视频流时间基计算pts
        pts = (frame->pts == AV_NOPTS_VALUE) ? NAN : frame->pts * av_q2d(tb);
        //放入frame队列
        ret = queue_picture(is, frame, pts, duration, frame->pkt_pos, is->viddec.pkt_serial);
        //取消引用frame
        av_frame_unref(frame);
     }
}
```

整体就是一个循环，调用get_video_frame 获取解码后frame， 调用queue_picture 将frame放入解码后的队列。

## get_video_frame

```c
static int get_video_frame(VideoState *is, AVFrame *frame)
{
    int got_picture;
    //解码，将解码后的数据放入frame中
    if ((got_picture = decoder_decode_frame(&is->viddec, frame, NULL)) < 0)
        return -1;//处理abort

    if (got_picture) {
        double dpts = NAN;

        if (frame->pts != AV_NOPTS_VALUE)
            dpts = av_q2d(is->video_st->time_base) * frame->pts;

        frame->sample_aspect_ratio = av_guess_sample_aspect_ratio(is->ic, is->video_st, frame);
        //处理丢帧
        if (framedrop>0 || (framedrop && get_master_sync_type(is) != AV_SYNC_VIDEO_MASTER)) {
            if (frame->pts != AV_NOPTS_VALUE) {
                double diff = dpts - get_master_clock(is);
                if (!isnan(diff) && fabs(diff) < AV_NOSYNC_THRESHOLD &&
                    diff - is->frame_last_filter_delay < 0 &&
                    is->viddec.pkt_serial == is->vidclk.serial &&
                    is->videoq.nb_packets) {
                    is->frame_drops_early++;
                    av_frame_unref(frame);
                    got_picture = 0;
                }
            }
        }
    }
    return got_picture;
}
```

get_video_frame 调用decoder_decode_frame 获取解码后的一帧数据。

获取frame后，判断是否需要处理丢帧，做丢帧处理。

返回值: 成功获取frame(>0)， 被丢帧（=0），收到了退出请求（-1）

## decoder_decode_frame

需要先关注一个结构体Decoder

```
typedef struct Decoder {
    //解码前数据
    AVPacket *pkt;
    //pkt队列
    PacketQueue *queue;
    //解码器上下文
    AVCodecContext *avctx;
    int pkt_serial;
    int finished;
    int packet_pending; //标记当前pkt未被成功消费，后续需要重新处理
    SDL_cond *empty_queue_cond; //绑定read_thread线程的continue_read_thread
    int64_t start_pts;
    AVRational start_pts_tb;
    int64_t next_pts;
    AVRational next_pts_tb;
    SDL_Thread *decoder_tid;
} Decoder;
```

在VideoState 结构体中,保存了音频，视频，字幕解码相关的Decoder实例。

```
Decoder auddec;
Decoder viddec;
Decoder subdec;
```

decoder_decode_frame 根据 Decoder， 实现音频，视频，字幕解码的主要逻辑。

```
static int decoder_decode_frame(Decoder *d, AVFrame *frame, AVSubtitle *sub) {
    int ret = AVERROR(EAGAIN);
    for (;;) {
       //.....
    }    
}
```

整体又是一个大循环， 我们把它拆开看

```c
if (d->queue->serial == d->pkt_serial) {
    //判断packetqueue的序列号等于Decoder的序列号
    //packetqueue的序列号，在发生seek操作后，会+1
    do {
        if (d->queue->abort_request)
            //如果收到了退出请求，返回-1
            return -1;

        switch (d->avctx->codec_type) {
            case AVMEDIA_TYPE_VIDEO:
                //从解码器读frame
                ret = avcodec_receive_frame(d->avctx, frame);
                if (ret >= 0) {
                    //读到了frame, 设置frame的pts
                    //decoder_reorder_pts: let decoder reorder pts 0=off 1=on -1=auto
                    if (decoder_reorder_pts == -1) {
                        frame->pts = frame->best_effort_timestamp;
                    } else if (!decoder_reorder_pts) {
                        frame->pts = frame->pkt_dts;
                    }
                }
                break;
            case AVMEDIA_TYPE_AUDIO:
                //从解码器读frame
                ret = avcodec_receive_frame(d->avctx, frame);
                if (ret >= 0) {
                    //读到了frame，设置frame的pts
                    AVRational tb = (AVRational){1, frame->sample_rate};
                    if (frame->pts != AV_NOPTS_VALUE)
                        //pts转换，从编码器的时间基，转换为tb作为时间基
                        frame->pts = av_rescale_q(frame->pts, d->avctx->pkt_timebase, tb);
                    else if (d->next_pts != AV_NOPTS_VALUE)
                        //frame的pts没有值，参考d->next_pts，并做时间基的转化
                        frame->pts = av_rescale_q(d->next_pts, d->next_pts_tb, tb);
                    if (frame->pts != AV_NOPTS_VALUE) {
                        //计算next_pts，会被没有pts的Frame参考
                        //保存next_pts_tb
                        d->next_pts = frame->pts + frame->nb_samples;
                        d->next_pts_tb = tb;
                    }
                }
                break;
        }
        if (ret == AVERROR_EOF) {
            //解码器结束，所有的帧已经被读出
            d->finished = d->pkt_serial;
            //重置解码器内部状态
            avcodec_flush_buffers(d->avctx);
            return 0;
        }
        if (ret >= 0)
            return 1;
    } while (ret != AVERROR(EAGAIN)); //需要送入更多的pkts
}
```

一个if条件，内嵌一个do.while循环。

首先 if 判断`d->queue->serial == d->pkt_serial`，保证当前要处理的pkt与pkt->queue的序列号一致。如果不一致，证明是该pkt和pkt->queue中元素，是两段不连续的数据，进入后续流程，做丢帧处理。

如果序列号一致，进入循环，尝试从解码器获取frame。

我们看下这个循环

1. 判断是否收到退出请求

2. switch判断解码器的类型，处理audio 和 video 的情况。 调用avcodec_receive_frame 尝试从解码器获取frame。 返回值>=0 代表获取成功，转换frame的pts

3. 处理avcodec_receive_frame的返回值。
   
   - ret = AVERROR_EOF 解码器所有的帧已被读出，解码结束，返回0.
   
   - ret >= 0,  成功获取了frame， 直接返回 1
   
   - ret = AVERROR(EAGAIN)， 解码器需要接受更多pkt才可以输出frame，跳出do.while循环。

上一阶段尝试从解码器中读取frame， 但是解码器报告AVERROR(EAGAIN)，需要更多的pkt 才能产出frame。 那么下一阶段处理获取pkt，给解码发送pkt。

```c
do {
    if (d->queue->nb_packets == 0)
        //pkt队列为空，通知read_thread去获取更多数据
        SDL_CondSignal(d->empty_queue_cond);
    if (d->packet_pending) {
        d->packet_pending = 0;
    } else {
        int old_serial = d->pkt_serial;
        if (packet_queue_get(d->queue, d->pkt, 1, &d->pkt_serial) < 0)
            return -1;
        //如果新的pkt的序列号，和之前的不一致。可能是发生了seek操作，两段数据不连续了
        //冲洗解码器
        if (old_serial != d->pkt_serial) {
            //冲洗解码器内部的buffer
            avcodec_flush_buffers(d->avctx);
            d->finished = 0;
            //更新pts， timebase
            d->next_pts = d->start_pts;
            d->next_pts_tb = d->start_pts_tb;
        }
    }
    //判断序列号是否满足
    if (d->queue->serial == d->pkt_serial)
        break;
    //过滤掉序列号不满足条件的pkt
    av_packet_unref(d->pkt);
} while (1);
```

又是一个do.while 循环。

1. 如果pkt-queue为空，调用SDL_CondSignal，通知read_thread去获取更多的pkt

2. 如果d->packet_pending为true,  将d->packet_pending标记为false。在下一阶段，将pkt发送给解码器时，如果解码器的pkt队列已满，无法接受d- >pkt。 通过将d->packet_pending设置为1， 标记d- >pkt 为待处理，下次重新将d->pkt发送给解码器。

3. 没有待处理pkt，调用packet_queue_get从d->queue中获取一个pkt。其中 packet_queue_get 的第三个参数block 被设置为1， 在获取ptk的时候，如果没有ptk queue 为空，内部调用SDL_CondWait将线程置于等待状态。

4. 如果从队列里获得了pkt，pkt的序列号和Decoder之前保存的pkt的序列号不一致。例如发生了seek，中间数据不连续了，此时调用avcodec_flush_buffers冲洗解码器内部buffer，让解码器准备好从seek位置开始解码。

5. 循环将pkt序列号不一致的pkt调用av_packet_unref(d->pkt);丢弃，直到`d->queue->serial == d->pkt_serial`,此时获取了一个pkt。

前面解码器要更多的ptk才可以输出frame, 然后第二阶段我们从pkt queue中也获取到了一个pkt，下一步将获取的pkt发送给解码器了

```c
if (d->avctx->codec_type == AVMEDIA_TYPE_SUBTITLE) {
    int got_frame = 0;
    //Return a negative value on error, otherwise return the number of bytes used
    ret = avcodec_decode_subtitle2(d->avctx, sub, &got_frame, d->pkt);
    if (ret < 0) {
        //解码发生了错误，为了和avcodec_send_packet的错误码一起处理，转换为AVERROR(EAGAIN)，尝试继续发送pkt
        ret = AVERROR(EAGAIN);
    } else {
        if (got_frame && !d->pkt->data) {
            //d->pkt->data = NULL 代表给解码器发送flush消息，
            //需要持续给解码器flush消息，直到无法继续读取到新的frame, 
            //因此将packet_pending设置为1,标记当前pkt为待处理，直到flush完成
            d->packet_pending = 1;
        }
        ret = got_frame ? 0 : (d->pkt->data ? AVERROR(EAGAIN) : AVERROR_EOF);
    }
    av_packet_unref(d->pkt);
} else {
    //给音视频解码器发送pkt
    if (avcodec_send_packet(d->avctx, d->pkt) == AVERROR(EAGAIN)) {
        //报错AVERROR(EAGAIN)，解码器此时不能接受更多了pkt
        //需要调用avcodec_receive_frame将解码器中的frame读出才可以继续send pkt
        av_log(d->avctx, AV_LOG_ERROR, "Receive_frame and send_packet both returned EAGAIN, which is an API violation.\n");
        //比较当前pkt未被成功消费，后续需要重新处理
        d->packet_pending = 1;
    } else {
        //send pkt 成功，引用计数-1
        av_packet_unref(d->pkt);
    }
}
```

这里字幕解码器发送pkt 调用的是 avcodec_decode_subtitle2 

给音视频解码器发送pkt 调用的是 avcodec_send_packet。

注意发送pkt返回AVERROR(EAGAIN)， 此时解码器无法接受当前pkt（可能是内部的pkt的队列满了）。通过`d->packet_pending = 1`将pkt标记为待处理，下次循环，重新尝试发送给解码器解码。



如果解码器成功消费了pkt，继续进入循环。回到读frame的阶段，读到了frame，就返回给上层去加入队列。





## 总结

 video_thread的工作是循环从pkt queue 取出pkt，送给解码器解码，将解码后的frame 放入frame queue。

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16479425075661647942506708.png)




