---

layout: post
title: "cmake find_package"
date: 2022-03-13
tag: cmake

---

参考：

- 官方文档  [find_package](https://cmake.org/cmake/help/latest/command/find_package.html#id3)

- [Cmake之深入理解find_package()的用法](https://zhuanlan.zhihu.com/p/97369704)



## 使用

通过find_package命令，可以找到三方库对应的头文件路径和库文件路径，不用手动管理这些路径了。例如要引用CURL库，在CMakeLists文件可以简单写成下面的形式

```cmake
find_package(CURL)
add_executable(curltest curltest.cc)
if(CURL_FOUND)
    target_include_directories(clib PRIVATE ${CURL_INCLUDE_DIR})
    target_link_libraries(curltest ${CURL_LIBRARY})
else(CURL_FOUND)
    message(FATAL_ERROR ”CURL library not found”)
endif(CURL_FOUND)
```

## 原理

find_package 有两种搜索模式

### Module mode

在[`CMAKE_MODULE_PATH`](https://cmake.org/cmake/help/latest/variable/CMAKE_MODULE_PATH.html#variable:CMAKE_MODULE_PATH "CMAKE_MODULE_PATH")指定的路径下搜索名为`Find<PackageName>.cmake`的文件

该文件提供了库对应的头文件和库文件路径。

### Config mode

- 搜索`<lowercasePackageName>-config.cmake`或者`<PackageName>Config.cmake`

- 搜索`<lowercasePackageName>-config-version.cmake`或者`<PackageName>ConfigVersion.cmake`



如果找到

- `<PackageName>_FOUND` 为true

- `<PackageName>_INCLUDE_DIR` 会被设置

- `<PackageName>_LIBRARY` 会被设置

找不到

- `<PackageName>_FOUND` 为false



## 如何写`Find<PackageName>.cmake`

[wasmint/FindSDL2.cmake at master · WebAssembly/wasmint · GitHub](https://github.com/WebAssembly/wasmint/blob/master/cmake/FindSDL2.cmake)

1. 调用[find_path](https://cmake.org/cmake/help/latest/command/find_path.html)找头文件路径

2. 调用[find_library](https://cmake.org/cmake/help/latest/command/find_library.html)找库的路径

3. 通过[FindPackageHandleStandardArgs](https://cmake.org/cmake/help/latest/module/FindPackageHandleStandardArgs.html)导出变量

通过CMAKE_MODULE_PATH指定路径，就可以通过find_package命令使用该三方库的头文件和库文件了。


