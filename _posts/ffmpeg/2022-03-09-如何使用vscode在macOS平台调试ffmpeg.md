---

layout: post
title: "如何使用vscode在macOS平台调试ffmpeg"
date: 2022-03-09 
tag: ffmpeg

---

# 如何使用vscode在macOS平台调试ffmpeg

# [使用xcode 调试 ffmepg](https://blog.csdn.net/lipeiran1987/article/details/89553022?utm_medium=distribute.pc_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-2.channel_param&depth_1-utm_source=distribute.pc_relevant.none-task-blog-BlogCommendFromMachineLearnPai2-2.channel_param)

# 使用vscode调试ffmpeg

准备知识：[Debug C++ in Visual Studio Code](https://code.visualstudio.com/docs/cpp/cpp-debug)

ffmpeg 源码 https://github.com/FFmpeg/FFmpeg.git

## ffmpeg 配置, 使其支持调试

关于`-g3`相关知识[gcc-g-vs-g3-gdb-flag-what-is-the-difference](https://stackoverflow.com/questions/10475040/gcc-g-vs-g3-gdb-flag-what-is-the-difference)

```bash
./configure  --disable-optimizations --disable-stripping --enable-debug=3 --disable-doc
make -j `nproc`
make install
```

![image-20210422182014703.png](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/1646798696028ceaddb1d1dd2473496faad4c1883ba1d.png)
以`_g`结尾的就是可以调试的程序`ffmpeg_g, ffplay_g, ffprobe_g`

## vscode配置

![image-20210422181630503.png](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/1646798890870e47d61888a5e4095b6b1fd9c30246471.png)

如下命令：

```
# macOS上列出所有的音视频设备
ffmpeg -f avfoundation -list_devices true -i ""
```

> launch.json 对应的配置

```
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "(lldb) Launch",
            "type": "cppdbg",
            "request": "launch",
            "program": "${workspaceFolder}/ffmpeg_g",
            "args": ["-f", "avfoundation", "-list_devices", "true", "-i", "\"\""],
            "stopAtEntry": false,
            "cwd": "${workspaceFolder}",
            "environment": [],
            "externalConsole": false,
            "MIMode": "lldb"
        }
    ]
}
```

打上断点，点击运行，就可以愉快的调试了
![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/164679893487073e861799f104c449a57f809f7e7c1e1.png)

附上链接：lldb 使用教程 [Tutorial](https://lldb.llvm.org/use/tutorial.html)

## 备注：m1 芯片的mac 如果遇到调试问题

[ ERROR: Unable to start debugging. Unexpected LLDB output from command "-exec-run". process exited with status -1 (attach failed ((os/kern) invalid argument)) ](https://github.com/microsoft/vscode-cpptools/issues/6779)



解决办法：

使用 `CodeLLDB debugger`插件，而不是vc code 原生的调试插件

> I would suggest you to use CodeLLDB debugger (vadimcn.vscode-lldb). It's an extension in VSCode and works exactly like the native debugger in VSCode. For its setup, you just need to change the configuration of your launch.json file with the one provided by the extension. And that should do the trick.

> Now if you would try to debug then, VSCode will make use of that extension and should be able to debug your programs as it was to be done by the native debugger.

> I am personally using it on my M1 chip MacBook Air, and it works perfectly fine. According to me, It's much easier to implement than other workarounds present at the moment.


