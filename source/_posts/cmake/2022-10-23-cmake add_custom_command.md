---
layout: post
title: "cmake add_custom_command"
date: 2022-10-23
tag: cmake
---

目的： 添加自定义的构建规则到生成的构建系统中。

有两种用法：
1. 使用外部命令来产生一个输出, 例如生成文件
2. 监听一个target的构建事件，在target构建前或者构建后，执行命令


# Examples: Generating Files

添加命令，执行后生成源文件

```
add_custom_command(
  OUTPUT out.c
  COMMAND someTool -i ${CMAKE_CURRENT_SOURCE_DIR}/in.txt
                   -o out.c
  DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/in.txt
  VERBATIM)
add_library(myLib out.c)
```

通过生成器表达式，为每个config指定不同的输出
```
add_custom_command(
  OUTPUT "out-$<CONFIG>.c"
  COMMAND someTool -i ${CMAKE_CURRENT_SOURCE_DIR}/in.txt
                   -o "out-$<CONFIG>.c"
                   -c "$<CONFIG>"
  DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/in.txt
  VERBATIM)
add_library(myLib "out-$<CONFIG>.c")
```

# Examples: Build Events

在target被构建，链接之后，执行自定义命令

```
add_executable(myExe myExe.c)
add_custom_command(
  TARGET myExe POST_BUILD
  COMMAND someHasher -i "$<TARGET_FILE:myExe>"
                     -o "$<TARGET_FILE:myExe>.hash"
  VERBATIM)
```

目前支持两种
- PRE_LINK 编译后，连接前执行命令
- POST_BUILD 构建后，成功链接后执行命令

