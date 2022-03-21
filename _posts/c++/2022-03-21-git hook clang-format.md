---

layout: post
title: "git hooks  结合 clang-format 提交前自动格式化代码"
date: 2022-03-21 
tag: c++

---

## [ClangFormat ](https://clang.llvm.org/docs/ClangFormat.html)

ClangFormat 描述了一组构建在 [LibFormat]((https://clang.llvm.org/docs/LibFormat.html)) 之上的工具。它可以以多种方式支持您的工作流，包括独立工具和编辑器集成。

其中独立的工具就是clang-format, 可用于格式化 c/c + +/Java/JavaScript/JSON/Objective-C/Protobuf/c # 代码。

clang-format的默认配置文件是`.clang-format`或`_clang-format`, 也可以通过`clang-format -style=file`指定配置文件。



`.clang-format` 使用yaml格式，指定了如何对文件格式化的规则。

可以基于预定义的样式，快速创建`.clang-format`文件。

- `LLVM` A style complying with the [LLVM coding standards](https://llvm.org/docs/CodingStandards.html)

- `Google` A style complying with [Google’s C++ style guide](https://google.github.io/styleguide/cppguide.html)

- `Chromium` A style complying with [Chromium’s style guide](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/styleguide/styleguide.md)

- `Mozilla` A style complying with [Mozilla’s style guide](https://firefox-source-docs.mozilla.org/code-quality/coding-style/index.html)

- `WebKit` A style complying with [WebKit’s style guide](https://www.webkit.org/coding/coding-style.html)

- `Microsoft` A style complying with [Microsoft’s style guide](https://docs.microsoft.com/en-us/visualstudio/ide/editorconfig-code-style-settings-reference)

- `GNU` A style complying with the [GNU coding standards](https://www.gnu.org/prep/standards/standards.html)

例如生成llvm风格的：

```
clang-format -style=llvm -dump-config > .clang-format
```

 然后可以基于生成的`.clang-format`文件修改参数，定制自己的样式。

更多参考： [Clang-Format Style Options ](https://clang.llvm.org/docs/ClangFormatStyleOptions.html)





mac 下安装 clang-format

```
brew install clang-format
```

将生成的`.clang-format`放入工程目录，执行命令格式化文件

```
clang-format -i xx.cpp
```

`-i`格式化当前文件，并将格式化后的内容输出到当前文件。不加`-i`会将格式化的内容输出到标准输出。



然后我们希望在提交的时候根据我们的配置，自动格式化代码，如何做呢？

可以通过git hooks 结合clang-format 在提交的时候自动格式化我们的代码。

## [pre-commit](https://pre-commit.com/)

> A framework for managing and maintaining multi-language pre-commit hooks.



 安装：

```
$ brew install pre-commit
# 查看版本
$ pre-commit --version
pre-commit 2.17.0
```



添加配置文件`.pre-commit-config.yaml`，通过[`pre-commit sample-config`](https://pre-commit.com/#pre-commit-sample-config)

命令快速生成一个基本的配置文件。 更多关于文件中选项的配置，参考[pre-commit](https://pre-commit.com/#plugins)

```
➜  ~ pre-commit sample-config
# See https://pre-commit.com for more information
# See https://pre-commit.com/hooks.html for more hooks
repos:
-   repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v3.2.0
    hooks:
    -   id: trailing-whitespace
    -   id: end-of-file-fixer
    -   id: check-yaml
    -   id: check-added-large-files
```

上面配置指定了如何去格式化python代码，pre commit 支持格式化其他的编程语言，参考

[supported hooks](https://pre-commit.com/hooks.html)查看所有支持的语言。



想结合clang-format对工程中的c++代码自动格式化。在[supported hooks](https://pre-commit.com/hooks.html)找到了[GitHub - doublify/pre-commit-clang-format: ClangFormat hook for pre-commit](https://github.com/doublify/pre-commit-clang-format)



如何使用呢?

1. 在工程中创建`.pre-commit-config.yaml`文件

2. 配置`.pre-commit-config.yaml`文件
   
   ```
   repos:
   -   repo: https://github.com/doublify/pre-commit-clang-format.git
       rev: 62302476d0da01515660132d76902359bed0f782
       hooks:
       -   id: clang-format
   ```

3. 安装git hooks 脚本
   
   ```
   $ pre-commit install
   pre-commit installed at .git/hooks/pre-commit
   ```

4.  (可选)手动调用pre commit，看看格式化后的效果
   
   ```
   $ pre-commit run --all-files
   ```

5.  调用`git commit`, 会触发git hook，调用`clang-format`自动化格式代码。


