
---

layout: post
title: "Xcode 源码调试微信 xlog"
date: 2024-03-08

---

# Tencent/masr xlog macOS 源码调试

## get include folder 

```
cd mars
python build_osx.py
Enter menu:
1. Clean && build.
2. Gen OSX Project.
3. Build xlog.
4. Exit
```

选择1，生成 `mars.framework`, 我们主要是使用头文件目录。

## gen osx project
```
cd mars
python build_osx.py
Enter menu:
1. Clean && build.
2. Gen OSX Project.
3. Build xlog.
4. Exit
# input 2
```

执行结果

```
-- ==============config mars====================
-- Configuring done (6.6s)
-- Generating done (0.0s)
-- Build files have been written to: /Users/yxibng/Github/mars/mars/cmake_build/OSX
```

在 mars/cmake_build/OSX 目录中找到 mars.xcodeproj

```
cd mars/cmake_build/OSX 

ls
CMakeCache.txt       baseevent            comm                 sdt
CMakeFiles           boost                include              stn
CMakeScripts         boot                 install_manifest.txt xlog
Darwin.out           build                lib                  zstd
app                  cmake_install.cmake  mars.xcodeproj
```

## 将 mars.xcodeproj 作为子工程，添加为依赖项

通过 cmake 生成的 project 定义了生成 mars.framework 的几个相关target， 将 mars.xcodeproj 设置为子工程，
主工程依赖 mars.xcodeproj 定义的target，即可实现 xlog 的源码调试。

1. create new macOS project: xlog-test, selcte language: Objective-C
2. mars.xcodeproj 添加到 xlog-test 工程中
3. 将 mars.framework/Headers 拷贝到 xlog-test 根目录
4. xlog-test 配置 header search paths， 值为 `$(SRCROOT)/Headers`
![17098674388361709867437953.png](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/17098674388361709867437953.png)
5. xlog-test 配置 linked libraries
![17098675228351709867522443.png](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/17098675228351709867522443.png)
6. 添加辅助代码，从 MacDemo 中获取， 拷贝到 xlog-test 工程中
![17098675948351709867593931.png](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/17098675948351709867593931.png)
7. LogHelper 中添加 setup 方法，用于初始化 xlog
```
+ (void)setup {
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES);
    NSString *libraryDirectory = [paths firstObject];
    
    // init xlog
#if DEBUG
    xlogger_SetLevel(kLevelDebug);
    mars::xlog::appender_set_console_log(true);
#else
    xlogger_SetLevel(kLevelInfo);
    appender_set_console_log(false);
#endif
    mars::xlog::XLogConfig config;
    config.mode_ = mars::xlog::kAppenderAsync;
    config.logdir_ = [[libraryDirectory stringByAppendingString:@"/log/"] UTF8String];
    config.nameprefix_ = "Test";
    config.pub_key_ = "";
    config.compress_mode_ = mars::xlog::kZlib;
    config.compress_level_ = 0;
    config.cachedir_ = "";
    config.cache_days_ = 0;
    appender_open(config);
}
```
8. AppDelegate初始化调用
```
- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    // Insert code here to initialize your application
    [LogHelper setup];
}
```
9. 用`LogUtil.h`中宏定义打log
```
LOG_ERROR(kModuleViewController, @"this is a test log!");
```
10. 愉快地断点，调试吧
