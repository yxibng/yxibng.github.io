# 入口

程序启动初始化xlog

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
    NSLog(@"dir = %s", config.logdir_.c_str());
    config.nameprefix_ = "Test";
    config.pub_key_ = "";
    config.compress_mode_ = mars::xlog::kZlib;
    config.compress_level_ = 0;
    config.cachedir_ = "";
    config.cache_days_ = 0;
    appender_open(config);
}
```

- 设置 log level
- 设置是否开启 控制台 日志输出
- 设置写日志的模式为异步
    - 暂存到 mmap buffer 中，满足条件刷入文件中
    - 避免每写一条log调用一次 IO
- 设置log日志的存储路径
- 设置log日志的文件名前缀
- 设置加密的公钥，不加密传空字符串
- 设置压缩模式，zlib 或者 Zstd
    - 日志会先压缩咋存储，如果加密，先压缩再加密
- 设置 mmap 临时文件路径，为空，使用 logdir_
- 设置缓存天数，为 0 





## format 后的日志
规则
```
level + timestamp + [pid, threadId(*is main thread)] + tag + [fileName, line, funcName] + message
```

示例

```
"[I][2024-03-29 +8.0 17:09:45.425][0, 105553147396480*][ViewController][ViewController.m:18, -[ViewController viewDidLoad]][Info:this is a test log!"
```
