---
layout: post
title: "ffmpeg packet queue 分析"
date: 2022-03-14
tag: ffmpeg

---

参考： [ffplay packet queue分析](https://zhuanlan.zhihu.com/p/43295650)

---

ffplay  用 PacketQueue 来保存解封装后的数据，即AVPacket。

ffplay首先定义了一个结构体MyAVPacketList：

```
typedef struct MyAVPacketList {
    //待解码的数据
    AVPacket *pkt;
    //pkt序列号
    int serial;
} MyAVPacketList;
```

可以理解为是队列的一个节点。

> 所以这里我认为命名为MyAVPacketNode更为合理

serial字段主要用于标记当前节点的序列号，ffplay中多处用到serial的概念，一般用于区分是否连续数据。在后面的代码分析中我们还会看到它的作用。

接着定义另一个结构体`PacketQueue`：

```
typedef struct PacketQueue {
    /* ffmpeg封装的队列数据结构，先入先出 */
    AVFifo *pkt_list;
    /* 当前队里的pkt的数量 */
    int nb_packets;
    /* 当前所有节点占用的总内存大小 */
    int size;
    /* 队列所有节点的合计时长 */
    int64_t duration;
    /* 是否要中止队列操作，用于安全快速退出播放 */
    int abort_request;
    //序列号，和MyAVPacketList的serial作用相同，但改变的时序稍微有点不同
    int serial;
    //用于维持PacketQueue的多线程安全(SDL_mutex可以按pthread_mutex_t理解）
    SDL_mutex *mutex;
    //用于读、写线程相互通知(SDL_cond可以按pthread_cond_t理解)
    SDL_cond *cond;
} PacketQueue;
```

结构体的第一个成员是AVFifo指针类型的。FFmpeg 定义了AVFifo结构体和操作这个结构体的一系列函数，实现了队列的数据结构。PacketQueue 是封装了AVFifo 实例，来管理MyAVPacketList，进而管理解封装后的AVPacket的。

## AVFifo

```c
struct AVFifo {
    uint8_t *buffer;

    size_t elem_size, nb_elems;
    size_t offset_r, offset_w;
    // distinguishes the ambiguous situation offset_r == offset_w
    int    is_empty;

    unsigned int flags;
    size_t       auto_grow_limit;
};
```

操作

```
AVFifo *av_fifo_alloc2(size_t elems, size_t elem_size,
                       unsigned int flags);

int av_fifo_write(AVFifo *f, const void *buf, size_t nb_elems);

int av_fifo_read(AVFifo *f, void *buf, size_t nb_elems);

void av_fifo_freep2(AVFifo **f);
```

- av_fifo_alloc2 创建队列

- av_fifo_read 从队列中读一个元素，队列长度减 1

- av_fifo_write 给队列添加一个元素， 队列长度加1 

- av_fifo_freep2 销毁队列

# PacketQueue 操作函数

`PacketQueue`操作提供以下方法：

- packet_queue_init:  初始化

- packet_queue_destroy： 销毁

- packet_queue_start： 开启

- packet_queue_abort： 终止

- packet_queue_get： 获取一个节点

- packet_queue_put： 存入一个节点

- packet_queue_put_nullpacket： 存入一个空节点

- packet_queue_flush： 清除队列内所有的节点

## packet_queue_init

```
static int packet_queue_init(PacketQueue *q)
{
    memset(q, 0, sizeof(PacketQueue));
    q->pkt_list = av_fifo_alloc2(1, sizeof(MyAVPacketList), AV_FIFO_FLAG_AUTO_GROW);
    if (!q->pkt_list)
        return AVERROR(ENOMEM);
    q->mutex = SDL_CreateMutex();
    if (!q->mutex) {
        av_log(NULL, AV_LOG_FATAL, "SDL_CreateMutex(): %s\n", SDL_GetError());
        return AVERROR(ENOMEM);
    }
    q->cond = SDL_CreateCond();
    if (!q->cond) {
        av_log(NULL, AV_LOG_FATAL, "SDL_CreateCond(): %s\n", SDL_GetError());
        return AVERROR(ENOMEM);
    }
    q->abort_request = 1;
    return 0;
}
```

1. 内部调用av_fifo_alloc2 创建AVFifo 队列实例

2. 创建mutex用于队列安全访问

3. 创建cond 用于队列等待和唤醒控制

4. 初始设置abort_request = 1

## packet_queue_destroy

```
static void packet_queue_destroy(PacketQueue *q)
{
    packet_queue_flush(q);
    av_fifo_freep2(&q->pkt_list);
    SDL_DestroyMutex(q->mutex);
    SDL_DestroyCond(q->cond);
}
```

1. 调用packet_queue_flush清空队列中的元素

2. 销毁AVFifo 队列实例

3. 销毁mutex

4. 销毁cond

## packet_queue_start

```
static void packet_queue_start(PacketQueue *q)
{
    SDL_LockMutex(q->mutex);
    q->abort_request = 0;
    q->serial++;
    SDL_UnlockMutex(q->mutex);
}
```

只是加锁，将abort_request设置为0，并且将serial加1，然后解锁。

## packet_queue_abort

```
static void packet_queue_abort(PacketQueue *q)
{
    SDL_LockMutex(q->mutex);

    q->abort_request = 1;

    SDL_CondSignal(q->cond);

    SDL_UnlockMutex(q->mutex);
}
```

加锁，将abort_request设置为1，标记为队列被终止。

同时唤醒等待条件变量的线程，使其正常退出,   解锁。

## packet_queue_get

```c
/* return < 0 if aborted, 0 if no packet and > 0 if packet.  */
static int packet_queue_get(PacketQueue *q, AVPacket *pkt, int block, int *serial)
{
    MyAVPacketList pkt1;
    int ret;
    //加锁
    SDL_LockMutex(q->mutex);

    for (;;) {
        if (q->abort_request) {
            //队列终止了, 设置返回值为-1
            ret = -1;
            break;
        }
        //从pkt_list中读出一个节点，放入MyAVPacketList中，同时更新队列的信息
        if (av_fifo_read(q->pkt_list, &pkt1, 1) >= 0) {
            //更新队列长度
            q->nb_packets--;
            //更新队列占用内存大小
            q->size -= pkt1.pkt->size + sizeof(pkt1);
            //更新队列时长
            q->duration -= pkt1.pkt->duration;
            //转移pkt1.pkt的内容到pkt中
            av_packet_move_ref(pkt, pkt1.pkt);
            //设置serial的值
            if (serial)
                *serial = pkt1.serial;
            //pkt1.pkt内容已近被转移，释放pkt1.pkt的内存
            av_packet_free(&pkt1.pkt);
            //返回值>0,代表从队列获取到了元素
            ret = 1;
            break;
        } else if (!block) {
            //没有获取到元素，但是调用放要求不阻塞，设置返回值为0，跳出循环
            ret = 0;
            break;
        } else {
            //没读到元素，阻塞等待有元素可以获取
            SDL_CondWait(q->cond, q->mutex);
        }
    }
    //解锁
    SDL_UnlockMutex(q->mutex);
    return ret;
}
```

从队列中获取一个元素

1. 加锁

2. 获取成功，队列元素减少，更新队列信息

3. 获取失败，要求不阻塞，立马返回

4. 获取失败，要求阻塞，调用wait进入等待状态

5. 解锁

## packet_queue_put

```
static int packet_queue_put_private(PacketQueue *q, AVPacket *pkt)
{
    MyAVPacketList pkt1;
    int ret;
    //如果队列被终止，返回-1
    if (q->abort_request)
       return -1;

    //给节点填充数据
    pkt1.pkt = pkt;
    //设置pkt的序列号
    pkt1.serial = q->serial;
    //将节点添加到队列
    ret = av_fifo_write(q->pkt_list, &pkt1, 1);
    if (ret < 0)
        return ret;
    //更新队列大小
    q->nb_packets++;
    //更新队列内存大小，添加节点size(pkt内存的大小 + 节点数据大小)
    q->size += pkt1.pkt->size + sizeof(pkt1);
    //更新队列的总时长
    q->duration += pkt1.pkt->duration;
    /* XXX: should duplicate packet data in DV case */
    SDL_CondSignal(q->cond);
    return 0;
}

static int packet_queue_put(PacketQueue *q, AVPacket *pkt)
{
    AVPacket *pkt1;
    int ret;
    //创建pkt1
    pkt1 = av_packet_alloc();
    if (!pkt1) {
        //创建pkt1失败，取消引用pkt
        av_packet_unref(pkt);
        return -1;
    }
    //将pkt内容转移到pkt1中
    av_packet_move_ref(pkt1, pkt);
    //加锁操加入队列
    SDL_LockMutex(q->mutex);
    //调用packet_queue_put_private将pkt1放入队列中
    ret = packet_queue_put_private(q, pkt1);
    SDL_UnlockMutex(q->mutex);

    if (ret < 0)
        //放入队列失败，需要取消引用pkt1
        av_packet_free(&pkt1);

    return ret;
}
```

1. 将AVPacket封装为MyAVPacketList，保存在内部的队列中

2. 队列长度加1，同时更新时长，内存占用等信息

3. packet_queue_put内部调用packet_queue_put_private来完成相关的操作

## packet_queue_put_nullpacket

```
//播放完了，从文件中读出了空的pkt，空的pkt丢给解码器的时候，会冲洗解码器，将解码器剩余的额数据读出来
static int packet_queue_put_nullpacket(PacketQueue *q, AVPacket *pkt, int stream_index)
{
    //设置pkt对应的stream_index 
    pkt->stream_index = stream_index;
    //添加有一个内容为空的pkt到队列中
    return packet_queue_put(q, pkt);
}
```

1. 给队列添加一个内容为空的pkt

2. 设置pkt对应的stream_index，追加到队列中

## packet_queue_flush

```
static void packet_queue_flush(PacketQueue *q)
{
    MyAVPacketList pkt1;
    //加锁
    SDL_LockMutex(q->mutex);
    //从内部队列循环获取元素，存入pkt1中
    while (av_fifo_read(q->pkt_list, &pkt1, 1) >= 0)
        //释放MyAVPacketList中的AVPacket的内存
        av_packet_free(&pkt1.pkt);
    //更新队列信息
    q->nb_packets = 0;
    q->size = 0;
    q->duration = 0;
    //serial加1
    q->serial++;
    //解锁
    SDL_UnlockMutex(q->mutex);
}
```

 清空队列，释放节点的内存，更新队列信息。

而对于serial的操作不是设置为0，而是在原来的基础上增加了1，为什么呢？

总结：

1. ffplay 用PacketQueue来保存解封装后的AVPacket

2. PacketQueue对元素的操作，依赖于内部基于ffmpeg AVFifo的队列实例

3. PacketQueue通过mutex来保证线层安全

4. PacketQueue通过条件变量来控制写入和读取的顺序
