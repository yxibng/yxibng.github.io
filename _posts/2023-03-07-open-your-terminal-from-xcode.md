---

layout: post
title: "open your terminal from xcode"
date: 2023-03-07
tag: shell

---

参考： [Open your terminal from Xcode](https://blog.eidinger.info/open-your-terminal-from-xcode)


实现方式： 

添加一个 Xcode Behaviors， 给 behavior 指定一个 shell script， behavior 触发的时候， 执行改脚本以当前目录打开 terminal。



# 步骤

创建一个 shell 脚本

> open-iterm-from-xcode

```
#!/bin/sh
dir="$PWD"
# remove a potential suffix in case Xcode shows a Swift Package
suffix="/.swiftpm/xcode"
dir=${dir//$suffix/}
open -a iterm "$dir
```

添加执行权限

```
chmod +x open-iterm-from-xcode
```


添加 Xcode Behaviors

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16781590158101678159015713.png)


打开终端

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16781591208101678159120572.png)


也可以使用，快捷键 `cmd + T`

