---
layout: post
title: "使用Xcode调试ffmpeg"
date: 2022-03-09 
tag: ffmpeg

---

ffmpeg 源码 https://github.com/FFmpeg/FFmpeg.git

## ffmpeg 配置, 使其支持调试

```bash
./configure  --disable-optimizations --disable-stripping --enable-debug=3 --disable-doc
make -j `nproc`
```

![image20210422182014703png](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/1646798696028ceaddb1d1dd2473496faad4c1883ba1d.png) 

以`_g`结尾的就是可以调试的程序`ffmpeg_g, ffplay_g, ffprobe_g`

## Xcode 配置

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468770121471646877011522.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468770571461646877056550.png)

把 ffmpeg 目录拖进工程，等待添加完成，可能时间较久

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468356217741646835620857.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468772051421646877204301.png)等待加载完毕

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468780312171646878030941.png)



添加target， 比如说调试`ffplay_g`

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468360299171646836029894.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468360897771646836089376.png)

修改对应的路径

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468361877781646836187409.png)

修改scheme，选择`ffplay_g`为可执行目标

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468363477791646836347004.png)

给`ffplay_g`传递参数

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468366427811646836642007.png)

开始打断点调试吧

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468367127821646836712289.png)

## 调试 ffmpeg官方的示例程序，示例位于`ffmpeg/doc/examples`路径下面

```shell
cd ffmpeg
make examples
```

后缀带`_g`的都是可以调试的

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16468370517811646837051618.png)

与调试ffplay_g一样，添加target，配置路径，配置可执行目标，添加参数，愉快地调试吧！

---

参考： [Xcode调试ffmpeg源码(十五) - 简书](https://www.jianshu.com/p/27a90b113413)
