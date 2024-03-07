---
layout: post
title: "ffplay frame queue 分析"
date: 2022-03-15
tag: ffmpeg

---

参考：  [ffplay frame queue分析](https://zhuanlan.zhihu.com/p/43564980)

## FrameQueue数据结构

ffplay 定义了 FrameQueue 来管理解码后的音频，视频以及字幕。

```c
/* Common struct for handling all types of decoded data and allocated render buffers. */
typedef struct Frame {
    AVFrame *frame;       //audio/video frame
    AVSubtitle sub;       //字幕
    int serial;           //序列号
    double pts;           /* presentation timestamp for the frame */
    double duration;      /* estimated duration of the frame */
    int64_t pos;          /* byte position of the frame in the input file */
    int width;
    int height;
    int format;
    AVRational sar;       //video aspect ratio
    int uploaded;
    int flip_v;           //video，是否应该在垂直方向翻转
} Frame;

typedef struct FrameQueue {
    Frame queue[FRAME_QUEUE_SIZE];  //frame数组，环形buffer
    int rindex;                     //读指针，指向下一个可读的位置
    int windex;                     //写指针，指向下一个可写的位置
    int size;                       //队列元素个数
    int max_size;                   //队列容量
    int keep_last;                  //是否在队列中保留上一个已读的元素
    int rindex_shown;               //标记rindex指向的元素是否已经展示（已读），keep_last为1时生效。
    SDL_mutex *mutex;               //锁,用于安全访问
    SDL_cond *cond;                 //条件变量，用于控制读取和写入，防止overrun和underflow
    PacketQueue *pktq;              //该frame queue 对应的 pkt queue
} FrameQueue;
```

> Frame的设计试图用一个结构体“融合”3种数据：视频、音频、字幕，虽然AVFrame既可以表示视频又可以表示音频，但在融合字幕时又需要引入AVSubtitle，以及一些其他字段，如width/height等来补充AVSubtitle，所以整个结构体看起来很“拼凑”（甚至还有视频专用的flip_v字段）
> 
> FrameQueue的设计理念：
> 
> 1. 高效率的读写模型
> 2. 高效的内存模型（节点内存以数组形式预分配，无需动态分配）
> 3. 环形缓冲区设计，同时可以访问上一读节点

## 队列的操作：

### 队列初始化

```c
static int frame_queue_init(FrameQueue *f, PacketQueue *pktq, int max_size, int keep_last)
{
    int i;
    memset(f, 0, sizeof(FrameQueue));
    //互斥锁创建
    if (!(f->mutex = SDL_CreateMutex())) {
        av_log(NULL, AV_LOG_FATAL, "SDL_CreateMutex(): %s\n", SDL_GetError());
        return AVERROR(ENOMEM);
    }
    //条件变量创建
    if (!(f->cond = SDL_CreateCond())) {
        av_log(NULL, AV_LOG_FATAL, "SDL_CreateCond(): %s\n", SDL_GetError());
        return AVERROR(ENOMEM);
    }
    //设置对应的pkt queue
    f->pktq = pktq;
    //设置队列的容量，视频 3, 音频 9，字幕 16
    f->max_size = FFMIN(max_size, FRAME_QUEUE_SIZE);
    //是否保留最后一个位置，视频音频保留，字幕不保留
    f->keep_last = !!keep_last;
    //给队列中的每个节点对应的frame初始化
    for (i = 0; i < f->max_size; i++)
        if (!(f->queue[i].frame = av_frame_alloc()))
            return AVERROR(ENOMEM);
    return 0;
}
```

初始化队列的内存，创建锁，条件变量，保存pkt queue，设置队列的容量，keep_last标志位初始化。初始化队列节点，给队列中的每个节点对应的frame调用av_frame_alloc分配内存。

参数max_size用来设置队列的容量，最大不超过FRAME_QUEUE_SIZE。其中视频队列的容量为3，音频9，字幕16。FRAME_QUEUE_SIZE定义如下:

```c
#define VIDEO_PICTURE_QUEUE_SIZE 3
#define SUBPICTURE_QUEUE_SIZE 16
#define SAMPLE_QUEUE_SIZE 9
#define FRAME_QUEUE_SIZE FFMAX(SAMPLE_QUEUE_SIZE, FFMAX(VIDEO_PICTURE_QUEUE_SIZE, SUBPICTURE_QUEUE_SIZE))
```

展开后FRAME_QUEUE_SIZE的值为16。

keep_last是一个bool值，表示是否在环形缓冲区的读写过程中保留最后一个读节点不被覆写。`f->keep_last = !!keep_last;`里的双感叹号是C中的一种技巧，旨在让int参数规整为0/1的“bool值”。视频和音频会保留最后一个节点，而字幕不保留。



### 队列销毁

```c
static void frame_queue_destory(FrameQueue *f)
{
    int i;
    for (i = 0; i < f->max_size; i++) {
        Frame *vp = &f->queue[i];
        //对每个节点调用frame_queue_unref_item
        frame_queue_unref_item(vp);
        //调用av_frame_free释放frame的内存
        av_frame_free(&vp->frame);
    }
    SDL_DestroyMutex(f->mutex);
    SDL_DestroyCond(f->cond);
}
```

较为重要的是queue元素的释放。分两步，分别是`frame_queue_unref_item`和`av_frame_free`。其中`av_frame_free`与初始化中的`av_frame_alloc`对应，用于释放AVFrame.

`frame_queue_unref_item`的定义如下：

```c
static void frame_queue_unref_item(Frame *vp)
{
    av_frame_unref(vp->frame);//引用计数-1
    avsubtitle_free(&vp->sub);//sub关联的内存释放
}
```

`frame_queue_unref_item`释放的内存都是**关联**的内存，而非结构体自身内存。

AVFrame内部有许多的AVBufferRef类型字段，而AVBufferRef只是AVBuffer的引用，AVBuffer通过引用计数自动管理内存（简易垃圾回收机制）。因此AVFrame在不需要的时候，需要通过`av_frame_unref`减少引用计数。

> 关于AVBufferRef的内存管理机制，可以参考这篇文章： [深入理解FFMPEG-AVBuffer/AVBufferRef/AVBufferPool]([深入理解FFMPEG-AVBuffer/AVBufferRef/AVBufferPool_muyuyuzhong的专栏-CSDN博客](https://blog.csdn.net/muyuyuzhong/article/details/79381152))

### 队列写操作

FrameQueue的“写”分两步，先调用`frame_queue_peek_writable`获取一个可写节点，在对节点操作结束后，调用`frame_queue_push`告知FrameQueue“存入”该节点。

> 阅读提示：  
> 在ffplay中，FrameQueue始终是一个线程写，另一个线程读。也就是只有一个读线程，不会有其他读线程竞争读；只有一个写线程，不会有其他线程竞争写；唯一需要的是读与写线程间的同步。FrameQueue的整个优化和设计思路正是基于这一点的。

先看`frame_queue_peek_writable`：

```c
static Frame *frame_queue_peek_writable(FrameQueue *f)
{
    /* wait until we have space to put a new frame */
    SDL_LockMutex(f->mutex);
    while (f->size >= f->max_size &&
           !f->pktq->abort_request) {
        //等待有空间可以写，才继续执行
        SDL_CondWait(f->cond, f->mutex);
    }
    SDL_UnlockMutex(f->mutex);

    if (f->pktq->abort_request)
        return NULL;
    //返回f->windex对应的frame
    return &f->queue[f->windex];
}
```

整个函数分3步：

1. 加锁情况下，等待直到队列有空余空间可写（`f->size < f->max_size`）
2. 如果有退出请求（`f->pktq->abort_request`），则返回NULL
3. 返回`windex`位置的元素（`windex`指向当前应写位置）

> 为什么这里锁的范围不是整个函数呢？这是为了减小锁的范围，以提高效率。而之所以可以在无锁的情况下安全访问queue 字段，是因为上文中提到的单读单写的特殊场景。首先，queue是一个预先分配好的数组，因此queue本身不发生变化，可以安全访问；接着queue内的元素，读和写不存在重叠，即windex和rindex不会重叠。
> 
> 关于“读和写不存在重叠”，仔细看看。因为queue数组被当做一个环形缓冲区使用，那么的确存在underrun和overrun的情况，即读过快，或写过快的情况，这时如果不加控制，就会呈现缓冲区覆盖。
> 
> FrameQueue的精明之处在于，先通过size判断当前缓冲区内空间是否够写，或者够读，比如这里先通过一个循环的条件等待，判断`f->size >= f->max_size`，如果`f->size >= f->max_size`，那么说明队列中的节点已经写满，也就是已经overrun了，此时如果再写，肯定会覆写未读数据，那么就需要继续等待。当无需等待时，windex指向的内存一定是已经读过的（除非代码异常了）。
> 
> 调用`frame_queue_peek_writable`取到Frame指针后，就可以对Frame内的字段自由改写，因为只有一个写进程，且无需担心读进程覆写。如上分析，读进程要读一个节点时，也会先判断underrun的情况）。

一般步骤是：

```c
Frame* vp = frame_queue_peek_writable(q);
//将要存储的数据写入frame字段，比如：
av_frame_move_ref(vp->frame, src_frame);
//存入队列
frame_queue_push(q);
```

`frame_queue_push`怎么知道要push的是这里的vp呢？

```c
static void frame_queue_push(FrameQueue *f)
{
    if (++f->windex == f->max_size)
        f->windex = 0;
    SDL_LockMutex(f->mutex);
    f->size++;
    SDL_CondSignal(f->cond);
    SDL_UnlockMutex(f->mutex);
}
```

答案是push当前windex节点。看`frame_queue_push`函数，执行两个步骤：

1. windex加1，如果超过max_size，则回环为0
2. 加锁情况下大小加1.

> 因为FrameQueue是基于固定长度的数组实现的队列，与链表队列不同，其节点在初始化的时候已经在队列中了，push所要做的只是通过某种标志记录该节点是否是写入未读的。ffplay的做法是对windex加1，将写指针移动到下一个元素，凡是windex“之前”的节点，都是写过的。（至于是否可读，rindex知道；至于后续有多少空间可写，size知道）

### 队列读操作

和写一样，FrameQueue的读也分两步。`frame_queue_peek_readable`和`frame_queue_next`。相比写要复杂一点的是 ，读的代码多考虑另一个特性，即允许保留上一读节点。

`frame_queue_peek_readable`代码如下：

```c
static Frame *frame_queue_peek_readable(FrameQueue *f)
{
    /* wait until we have a readable a new frame */
    SDL_LockMutex(f->mutex);
    while (f->size - f->rindex_shown <= 0 &&
           !f->pktq->abort_request) {
        SDL_CondWait(f->cond, f->mutex);
    }
    SDL_UnlockMutex(f->mutex);

    if (f->pktq->abort_request)
        return NULL;

    return &f->queue[(f->rindex + f->rindex_shown) % f->max_size];
}
```

和`frame_queue_peek_writable`类似，分三步:

1. 加锁情况下，判断是否有可读节点（`f->size - f->rindex_shown > 0`)
2. 如果有退出请求，则返回NULL
3. 读取当前可读节点`(f->rindex + f->rindex_shown) % f->max_size`

`rindex_shown`有些干扰代码分析，我们先看不支持keep_last的情况（只需要在初始化的时候传入keep_last = 0），此事`rindex_shown`始终为0，所以，`frame_queue_peek_readable`简化如下：

```c
static Frame *frame_queue_peek_readable(FrameQueue *f)
{
    /* wait until we have a readable a new frame */
    SDL_LockMutex(f->mutex);
    while (f->size <= 0 &&
           !f->pktq->abort_request) {
        SDL_CondWait(f->cond, f->mutex);
    }
    SDL_UnlockMutex(f->mutex);

    if (f->pktq->abort_request)
        return NULL;

    return &f->queue[f->rindex];
}

```

和peek_writable几乎是一一对应的。就不分析了。



在简化版本上理解引入`rindex_shown`的代码，我们需要先理解`rindex_shown`。`rindex_shown`的意思是`rindex`指向的节点是否被读过，如果被读过， 为1，反之，为0。这一行为，体现在`frame_queue_next`：

```c
static void frame_queue_next(FrameQueue *f)
{   
    //如果支持keep_last，并且f->rindex_shown为0, 将rindex_shown设置为1，返回
    if (f->keep_last && !f->rindex_shown) {
        f->rindex_shown = 1;
        return;
    }
    //否则，移动rindex指针，并减小size
    frame_queue_unref_item(&f->queue[f->rindex]);
    if (++f->rindex == f->max_size)
        f->rindex = 0;
    SDL_LockMutex(f->mutex);
    f->size--;
    SDL_CondSignal(f->cond);
    SDL_UnlockMutex(f->mutex);
}
```

`frame_queue_next`用于在读完一个节点后调用，用于标记一个节点已经被读过。

与写过程类似，读过程可以描述为：

```c
Frame* vp = frame_queue_peek_readable(f);
//读取vp的数据，比如
printf("pict_type=%d\n", vp->frame->pict_type);
frame_queue_next(f);
```

`frame_queue_next`比`frame_queue_push`略复杂，我们要分析两个行为：标记一个节点为已读，以及`rindex_shown`的赋值。

标记一个节点为已读于标记一个节点为已写是类似的，执行两个步骤：

1. rindex加1，如果超过max_size，则回环为0
2. 加锁情况下大小减1.

特别的是，对于以及读过的节点，需要调用`frame_queue_unref_item`释放关联内存。

执行rindex操作前，需要先判断`rindex_shown`的值，如果为0，则赋1。这么做的意图不妨画图分析：

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16473273492201647327349203.png)

这里模拟了从初始化开始的2次“读”。

还没开始读，rindex和rindex_shown均为0。这时要peek的读节点是节点0(图中黑色块）。

第一次读，调用next，满足条件`f->keep_last && !f->rindex_shown`，所以rindex仍然是0，而rindex_shown为1.此时节点0（灰色块）是已读节点，也是要keep的last节点，将要读的节点是节点1（黑色块）。（恰好是rindex+rindex_shown）

第二次读，peek了黑色块后，调用next，不满足条件`f->keep_last && !f->rindex_shown`，所以rindex为1，而rindex_shown为2.此时节点1（灰色块）是last节点，节点2（黑色块）是将要读的节点。（也恰好是rindex+rindex_shown）

继续往后分析，会一直重复第二次读的情况，始终是rindex指向了last，而rindex_shown一直为1，rindex+rindex_shown刚好是将要读的节点。

至此，`frame_queue_next`的行为算是明确了。回头看看`frame_queue_peek_readable`。

步骤1中，判断无可读节点，用的是`f->size - f->rindex_shown <= 0`，其实是以下代码的简化：

```c
if (f->rindex_shown)
    return f->size - 1;
else
    return f->size;
```

只是C中用int模拟bool，刚好rindex_shown为true是1，所以可以简化为`` `f->size - f->rindex_shown ``.

步骤3中，取将要读的节点用的是`(f->rindex + f->rindex_shown) % f->max_size`，同样也是一个简化：

```c
//这段代码根据上图很容易推导
if (f->rindex_shown)
    return (f->rindex + 1) % f->max_size; //因为rindex加1后可能超过max_size，所以这里取余
else
    return f->rindex;
```

以上，FrameQueue的读过程也分析完了。

为了支持灵活地读，还有一些辅助函数：

```c
//读当前节点（上文中的用词是“将要读的节点”，也就是黑色块），与frame_queue_peek_readable等效，但没有检查是否有可读节点
static Frame *frame_queue_peek(FrameQueue *f)
{
    return &f->queue[(f->rindex + f->rindex_shown) % f->max_size];
}

//读下一个节点
static Frame *frame_queue_peek_next(FrameQueue *f)
{
    return &f->queue[(f->rindex + f->rindex_shown + 1) % f->max_size];
}

//读上一个节点
static Frame *frame_queue_peek_last(FrameQueue *f)
{
    return &f->queue[f->rindex];
}

/* return the number of undisplayed frames in the queue */
static int frame_queue_nb_remaining(FrameQueue *f)
{
    return f->size - f->rindex_shown;
}
```

实现都比较简单，借助上图看下节点位置：

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16473274840541647327483583.png)

至此，FrameQueue的主体功能分析完了。从源码中可以看到FrameQueue是针对单读单写优化的高效的多线程模型，其设计思路不失为在C语言实践中可借鉴的一个好例子。
