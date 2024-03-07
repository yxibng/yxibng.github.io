---
layout: post
title: "ffmpeg example 5.硬件解码"
date: 2022-03-13 
tag: ffmpeg
---



在`hw_decode.c`示例中，ffmpeg展示了如何使用硬件加速来解码视频，我们来分析一下是怎么实现的。



## 硬件加速设备类型

展示所有可用的硬件加速方法, 在mac上只找到了`videotoolbox`加速的方式。

```shell
ffmpeg -hwaccels
Hardware acceleration methods:
videotoolbox
```

查看 AVHWDeviceType的定义，发现别的平台可以使用cuda，opencl， mediacodec，vulkan等来实现硬件加速。

```
enum AVHWDeviceType {
    AV_HWDEVICE_TYPE_NONE,
    AV_HWDEVICE_TYPE_VDPAU,
    AV_HWDEVICE_TYPE_CUDA,
    AV_HWDEVICE_TYPE_VAAPI,
    AV_HWDEVICE_TYPE_DXVA2,
    AV_HWDEVICE_TYPE_QSV,
    AV_HWDEVICE_TYPE_VIDEOTOOLBOX,
    AV_HWDEVICE_TYPE_D3D11VA,
    AV_HWDEVICE_TYPE_DRM,
    AV_HWDEVICE_TYPE_OPENCL,
    AV_HWDEVICE_TYPE_MEDIACODEC,
    AV_HWDEVICE_TYPE_VULKAN,
};
```

## 源码分析

 调用该示例程序。

```
./hw_decode videotoolbox /tmp/test.mp4 /tmp/test.yuv
```

1. 参数videotoolbox 指定使用的硬件加速方式，mac平台只找到这一种

2. /tmp/test.mp4 指定要解封装的文件，从文件中读取h264进行解码

3. /tmp/test.yuv 指定解码后写入的文件路径

### main 函数

```
int main(int argc, char *argv[])
{
    AVFormatContext *input_ctx = NULL;
    int video_stream, ret;
    AVStream *video = NULL;
    AVCodecContext *decoder_ctx = NULL;
    const AVCodec *decoder = NULL;
    AVPacket *packet = NULL;
    enum AVHWDeviceType type;
    int i;

    if (argc < 4) {
        fprintf(stderr, "Usage: %s <device type> <input file> <output file>\n", argv[0]);
        return -1;
    }
    //根据传入加速器名字，找到对应的type
    type = av_hwdevice_find_type_by_name(argv[1]);
    if (type == AV_HWDEVICE_TYPE_NONE) {
        fprintf(stderr, "Device type %s is not supported.\n", argv[1]);
        fprintf(stderr, "Available device types:");
        //没找到加速器，打印ffmepg 支持的加速器列表
        while((type = av_hwdevice_iterate_types(type)) != AV_HWDEVICE_TYPE_NONE)
            fprintf(stderr, " %s", av_hwdevice_get_type_name(type));
        fprintf(stderr, "\n");
        return -1;
    }
    //申请packet保存解码前数据
    packet = av_packet_alloc();
    if (!packet) {
        fprintf(stderr, "Failed to allocate AVPacket\n");
        return -1;
    }

    //打开输入的文件，关联到AVFormatContext
    if (avformat_open_input(&input_ctx, argv[2], NULL, NULL) != 0) {
        fprintf(stderr, "Cannot open input file '%s'\n", argv[2]);
        return -1;
    }
    //填充AVFormatContext，获取解封装信息
    if (avformat_find_stream_info(input_ctx, NULL) < 0) {
        fprintf(stderr, "Cannot find input stream information.\n");
        return -1;
    }

    //找到video 对应的stream index， 获取对应的解码器信息
    ret = av_find_best_stream(input_ctx, AVMEDIA_TYPE_VIDEO, -1, -1, &decoder, 0);
    if (ret < 0) {
        fprintf(stderr, "Cannot find a video stream in the input file\n");
        return -1;
    }
    video_stream = ret;

    //遍历获取解码器对应的硬件配置信息
    for (i = 0;; i++) {
        const AVCodecHWConfig *config = avcodec_get_hw_config(decoder, i);
        //如果没找到支持的config，结束程序
        if (!config) {
            fprintf(stderr, "Decoder %s does not support device type %s.\n",
                    decoder->name, av_hwdevice_get_type_name(type));
            return -1;
        }
        /*
         如果config的device_type匹配我们设置的类型，并且config的methods的值为AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX
         保存支持的hw_pix_fmt，跳出循环
         
         关于AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX
         如果我们选择了此种类型，需要在调用avcodec_open2()打开解码器之前，给AVCodecContext.hw_device_ctx设置正确的值。
         */
        
        if (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX &&
            config->device_type == type) {
            hw_pix_fmt = config->pix_fmt;
            break;
        }
    }
    //创建解码器上下文
    if (!(decoder_ctx = avcodec_alloc_context3(decoder)))
        return AVERROR(ENOMEM);

    video = input_ctx->streams[video_stream];
    //给解码器上下文填充参数，复制从文件中读的的解码器参数
    if (avcodec_parameters_to_context(decoder_ctx, video->codecpar) < 0)
        return -1;
    
    //get_format是一个函数指针，我们给ffmpeg提供一个函数，ffmpeg 调用该函数确定解码帧的数据格式
    decoder_ctx->get_format  = get_hw_format;

    //根据AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX的定义，我们需要给ctx->hw_device_ctx赋值
    if (hw_decoder_init(decoder_ctx, type) < 0)
        return -1;
    //打开解码器
    if ((ret = avcodec_open2(decoder_ctx, decoder, NULL)) < 0) {
        fprintf(stderr, "Failed to open codec for stream #%u\n", video_stream);
        return -1;
    }

    /* open the file to dump raw data */
    output_file = fopen(argv[3], "w+b");

    /* actual decoding and dump the raw data */
    while (ret >= 0) {
        //从文件中循环读视频帧，存入packet
        if ((ret = av_read_frame(input_ctx, packet)) < 0)
            break;

        if (video_stream == packet->stream_index)
            //解码packet，写文件
            ret = decode_write(decoder_ctx, packet);

        av_packet_unref(packet);
    }
    //冲洗解码器
    /* flush the decoder */
    ret = decode_write(decoder_ctx, NULL);

    if (output_file)
        fclose(output_file);
    av_packet_free(&packet);
    avcodec_free_context(&decoder_ctx);
    avformat_close_input(&input_ctx);
    av_buffer_unref(&hw_device_ctx);

    return 0;
}

```



1. 验证我们设置的加速器是否正确

2. 打开文件，解封装，读取视频流，解码器信息

3. 获取解码器支持的硬件配置信息，遍历，找到我们设置的类型，保存目标颜色格式

4. 创建解码器上下文，填充解码参数，通过`get_format`告知解码器目标颜色格式

5. 创建加速器实例，告诉解码器使用我们创建的加速器实例

6. 从文件中读视频帧，送入解码器

7. 从解码器中读取frame，判断颜色格式，处理数据从GPU复制到CPU

8. 去掉frame的字节对齐，写入输出文件中



### 硬件加速器目标像素格式

```
    //遍历获取解码器对应的硬件配置信息
    for (i = 0;; i++) {
        const AVCodecHWConfig *config = avcodec_get_hw_config(decoder, i);
        //如果没找到支持的config，结束程序
        if (!config) {
            fprintf(stderr, "Decoder %s does not support device type %s.\n",
                    decoder->name, av_hwdevice_get_type_name(type));
            return -1;
        }
        /*
         如果config的device_type匹配我们设置的类型，并且config的methods的值为AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX
         保存支持的hw_pix_fmt，跳出循环
         
         关于AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX
         如果我们选择了此种类型，需要在调用avcodec_open2()打开解码器之前，给AVCodecContext.hw_device_ctx设置正确的值。
         */
        
        if (config->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX &&
            config->device_type == type) {
            hw_pix_fmt = config->pix_fmt;
            break;
        }
    }

```



告诉解码器，我们希望输出像素格式

```
    //get_format是一个函数指针，我们给ffmpeg提供一个函数，ffmpeg 调用该函数确定解码帧的数据格式
    decoder_ctx->get_format  = get_hw_format;

```

 get_hw_format

```
static enum AVPixelFormat get_hw_format(AVCodecContext *ctx,
                                        const enum AVPixelFormat *pix_fmts)
{
    const enum AVPixelFormat *p;

    for (p = pix_fmts; *p != -1; p++) {
        if (*p == hw_pix_fmt)
            return *p;
    }

    fprintf(stderr, "Failed to get HW surface format.\n");
    return AV_PIX_FMT_NONE;
}

```

### 创建并设置加速器

```
static int hw_decoder_init(AVCodecContext *ctx, const enum AVHWDeviceType type)
{
    int err = 0;
    //创建硬件加速器实例
    if ((err = av_hwdevice_ctx_create(&hw_device_ctx, type,
                                      NULL, NULL, 0)) < 0) {
        fprintf(stderr, "Failed to create specified HW device.\n");
        return err;
    }
    //告诉解码器，使用我们创建的硬件加速器
    ctx->hw_device_ctx = av_buffer_ref(hw_device_ctx);

    return err;
}


```

### 解码，数据从GPU到CPU

```
static int decode_write(AVCodecContext *avctx, AVPacket *packet)
{
    AVFrame *frame = NULL, *sw_frame = NULL;
    AVFrame *tmp_frame = NULL;
    uint8_t *buffer = NULL;
    int size;
    int ret = 0;

    ret = avcodec_send_packet(avctx, packet);
    if (ret < 0) {
        fprintf(stderr, "Error during decoding\n");
        return ret;
    }

    while (1) {
        if (!(frame = av_frame_alloc()) || !(sw_frame = av_frame_alloc())) {
            fprintf(stderr, "Can not alloc frame\n");
            ret = AVERROR(ENOMEM);
            goto fail;
        }

        ret = avcodec_receive_frame(avctx, frame);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            av_frame_free(&frame);
            av_frame_free(&sw_frame);
            return 0;
        } else if (ret < 0) {
            fprintf(stderr, "Error while decoding\n");
            goto fail;
        }
        /*
         我们期待解码器能够解码出我们想要像素格式
         如果解码器输出了我们想要的格式，由于使用了硬件加速，我们需要将数据从GPU拷贝到cpu
         如果没有输出我们想要的格式，证明使用的是软件解码
         */
        if (frame->format == hw_pix_fmt) {
            /* 将解码数据从GPU拷贝到CPU */
            if ((ret = av_hwframe_transfer_data(sw_frame, frame, 0)) < 0) {
                fprintf(stderr, "Error transferring the data to system memory\n");
                goto fail;
            }
            tmp_frame = sw_frame;
        } else
            tmp_frame = frame;
        
        //申请一个AVFrame, 将解码后的yuv/rgb，去掉字节对齐拷贝过来
        size = av_image_get_buffer_size(tmp_frame->format, tmp_frame->width,
                                        tmp_frame->height, 1);
        buffer = av_malloc(size);
        if (!buffer) {
            fprintf(stderr, "Can not alloc buffer\n");
            ret = AVERROR(ENOMEM);
            goto fail;
        }
        //拷贝，去掉字节对齐
        ret = av_image_copy_to_buffer(buffer, size,
                                      (const uint8_t * const *)tmp_frame->data,
                                      (const int *)tmp_frame->linesize, tmp_frame->format,
                                      tmp_frame->width, tmp_frame->height, 1);
        if (ret < 0) {
            fprintf(stderr, "Can not copy image to buffer\n");
            goto fail;
        }
        //将已经去掉字节对齐的yuv/rgb数据，写入文件
        if ((ret = fwrite(buffer, 1, size, output_file)) < 0) {
            fprintf(stderr, "Failed to dump raw data.\n");
            goto fail;
        }

    fail:
        av_frame_free(&frame);
        av_frame_free(&sw_frame);
        av_freep(&buffer);
        if (ret < 0)
            return ret;
    }
}
```

## 总结：

1. 解码器配置的时候，需要告诉解码器我们使用的硬件加速器

2. 与解码器商量输出的颜色格式

3. 解码后处理，处理从GPU到CPU拷贝的内存拷贝




