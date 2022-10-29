---

layout: post
title: "Xcode 配置 clang-format 格式化 C++代码"
date: 2022-10-29
tag: c++

---

在命令行，通过`clang-format`工具，可以对代码进行格式化。但 `clang-fromat` 只能在终端中使用，有没有什么办法可以让它在Xcode中也可以使用呢，这样就很方便的对当前文档进行格式化了。 答案是： 借助 macOS 自带的 Automator 工具。


## clang-format 安装

```
brew install clang-format
```

## 添加 Automator 服务

打开 Automator 选择  "Quick Action"。
![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16670101357781667010134833.png)


左侧 Library 中搜索 "Run Shell Script" 并拖动到右侧。在脚本编辑框中输入以下内容：
```
source ~/.zshrc
clang-format
```
![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16670116407351667011639954.png)

同时记得勾选上 "Output replaces selected text"，然后保存并输入保存的名称，比如 clang-format。

至此一个服务便已添加好。

### Automator 在磁盘上的位置

The location of the user created services is under:

```
~/Library/Services/
```

other locations you get by entering following command in Terminal:

```
mdfind .workflow
```

## 使用

工程根目录，创建 `.clang-format` 文件

```
clang-format -style=google -dump-config > .clang-format
```
打开 Xcode， 选中需要格式化的代码并右键唤出菜单。选择 Services-> clang-format，这里 Services 中的名称即为前面步骤中保存的 Services 名称。

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16670146406641667014640354.png)

### 添加快捷键

显然右键这种方式不够便捷，进一步添加快捷键来实现更加方便的代码格式化。因为 Xcode 中格式化代码默认的快捷键为 control + I，不防我们就设置 clang-format 这个服务的快捷键为这个按键组合。

打开系统的首选项设置（可通过在 SpotLight 中搜索 "system preference"），然后打开键盘设置 "Kyeboard" 并切换到 "Shortcuts" 标签。

选中左侧 "App Shortcuts" 然后为 "Xcode" 绑定 `control` + `I` 执行 clang-format。
![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16670145906661667014590001.png)

然后便可通过快捷键方便地进行代码格式化了。

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16670146746631667014674463.png)

**注意：**
如果不生效，将 Xcode 中 `control` + `I` 相关的快捷键置空。

## 其他工具

存在一些其他以插件形式的工具，同样能达到使用 clang-format 格式化代码的目的，比如 [travisjeffery/ClangFormat-Xcode](https://github.com/travisjeffery/ClangFormat-Xcode)，但不支持 Xcode 9+，可安装其替代版 [V5zhou/ZZClang-format](https://github.com/V5zhou/ZZClang-format)

该插件安装好后，支持在文件保存时自动格式化，比较方便。

但因为是来自社区的插件，需要先将 Xcode 去掉签名 （unsign），参见 [inket/update_xcode_plugins](https://github.com/inket/update_xcode_plugins)。


原文链接： [Xcode 中配置 clang-format 格式化 C++ 代码](https://www.cnblogs.com/Wayou/p/xcode_clang_setup.html)