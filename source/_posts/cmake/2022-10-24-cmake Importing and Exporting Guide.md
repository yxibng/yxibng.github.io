---
layout: post
title: "cmake Importing and Exporting Guide"
date: 2022-10-24
tag: cmake
---

参考：https://cmake.org/cmake/help/latest/guide/importing-exporting/index.html 

# Importing

IMPORTED targets 将cmake工程外部的库，可执行文件引入到当前的cmake工程中，被引入的内容会关联到一个cmake 中一个
逻辑上的target。

创建方式，调用`add_executable()`,`add_library()`命令创建target， 但是要添加`IMPORTED`参数。

这个IMPORTED target不产生任何构建文件，因为他们引入的都是现成的库或者可执行文件。

一旦IMPORTED target 被创建好了，就可以像工程中的其他target一样被引用了。 通过这种方式，就可以方便，灵活引用外部可执行文件和库了。

## Importing Executables

使用磁盘上的可执行文件。

```
add_executable(myexe IMPORTED)
set_property(TARGET myexe PROPERTY
             IMPORTED_LOCATION "../InstallMyExe/bin/myexe")
add_custom_command(OUTPUT main.cc COMMAND myexe)
add_executable(mynewexe main.cc)
```

1. 创建一个IMPORTED target
2. 设置target相关属性，这里指定其关联的可执行文件路径
3. 添加了一个custom command， 用target myexe指定的可执行文件来生成文件`main.cc`
4. 创建一个正常的可执行target, 使用上一步生成的`main.cc`作为源文件

## Importing Libraries

导入已经构建好的库作为一个target来使用。
```
add_library(foo STATIC IMPORTED)
set_property(TARGET foo PROPERTY
             IMPORTED_LOCATION "/path/to/libfoo.a")
add_executable(myexe src1.c src2.c)
target_link_libraries(myexe PRIVATE foo)
```

1. 创建一个IMPORTED target
2. 设置target相关属性，这里指定其关联的静态库路径
3. 创建一个正常的可执行target myexe，链接上面创建的target foo

考虑到可能会有debug，release 等不同配置，引入具有不同配置的同一个库，可以使用下面的形式
```
find_library(math_REL NAMES m)
find_library(math_DBG NAMES md)
add_library(math STATIC IMPORTED GLOBAL)
set_target_properties(math PROPERTIES
  IMPORTED_LOCATION "${math_REL}"
  IMPORTED_LOCATION_DEBUG "${math_DBG}"
  IMPORTED_CONFIGURATIONS "RELEASE;DEBUG"
)
add_executable(myexe src1.c src2.c)
target_link_libraries(myexe PRIVATE math)
```
# Exporting Targets
> While IMPORTED targets on their own are useful, they still require that the project that imports them knows the locations of the target files on disk. The real power of IMPORTED targets is when the project providing the target files also provides a CMake file to help import them. A project can be setup to produce the necessary information so that it can easily be used by other CMake projects be it from a build directory, a local install or when packaged.

1. IMPORTED targets 要求使用这些target的工程，知道相关文件在磁盘上的位置。
2. 要想屏蔽这些细节，库的提供方，同时提供一个导入这个库的帮助文件 `xxxTargets.cmake`
3. 要想生成的库，可以通过`find_package()`命令来索引使用的话，可以在cmake工程中配置，在构建工程的时候，同时生成对应的帮助文件
    - `xxxTargets.cmake`
    - `xxxConfig.cmake`
    - `xxxConfigVersion.cmake`

## `xxxTargets.cmake`

```
cmake_minimum_required(VERSION 3.15)
project(MathFunctions)

# make cache variables for install destinations
include(GNUInstallDirs)

# specify the C++ standard
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED True)

# create library
add_library(MathFunctions STATIC MathFunctions.cxx)

# add include directories
target_include_directories(MathFunctions
                           PUBLIC
                           "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}>"
                           "$<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>"
)

# install the target and create export-set
install(TARGETS MathFunctions
        EXPORT MathFunctionsTargets
        LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
        ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
        RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
        INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
)

# install header file
install(FILES MathFunctions.h DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

# generate and install export file
install(EXPORT MathFunctionsTargets
        FILE MathFunctionsTargets.cmake
        NAMESPACE MathFunctions::
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/MathFunctions
)
# create IMPORTED target, set target property
add_library(MathFunctions::MathFunctions STATIC IMPORTED)
set_target_properties(MathFunctions::MathFunctions PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "${_IMPORT_PREFIX}/include"
)
```

1. 创建一个正常的静态库
2. 设置静态库头文件搜索路径，分别指定构建时和安装后的路径
3. 创建一个install命令，指定生成二进制文件的安装路径。其中`EXPORT MathFunctionsTargets`,指定了导出target文件对应的文件名字是`MathFunctionsTargets.cmake`
4. 指定头文件如何安装
5. 指定`MathFunctionsTargets.cmake`文件如何安装，`NAMESPACE MathFunctions::` 给导出的target添加前缀命名空间，一般带有命名空间的target，都是`IMPORTED target`
6. 创建一个`IMPORTED target`,名字是`MathFunctions::MathFunctions`
7. 设置`MathFunctions::MathFunctions`的属性，此处是头文件路径


如何使用导出的target文件, 在`CMakeLists.txt`文件中
```
 include(${INSTALL_PREFIX}/lib/cmake/MathFunctionTargets.cmake)
 add_executable(myexe src1.c src2.c )
 target_link_libraries(myexe PRIVATE MathFunctions::MathFunctions)
```
1. 首先包含`/MathFunctionTargets.cmake`文件
2. 创建一个可执行目标myexe
3. 链接MathFunctions::MathFunctions到myexe

## 支持`find_package()`

使用示例：

```
find_package(Stats 2.6.4 REQUIRED)
target_link_libraries(MathFunctions PUBLIC Stats::Types)
```

find_package() 支持两种搜索模式
- module mode， 针对非cmake构建的库，搜索`Find<PackageName>.cmake`文件
- config mode， 针对cmake构建的库，相关文件为
    - target相关： `<lowercasePackageName>-config.cmake`或者`<PackageName>Config.cmake`
    - 版本相关： `<lowercasePackageName>-config-version.cmake` 或 `<PackageName>ConfigVersion.cmake`

因此，cmake构建的库，想要支持`find_package()`的config模式，需要提供
- `xxxConfig.cmake`
- `xxConfigVersion.cmake`


首先包含`CMakePackageConfigHelpers`模块
```
include(CMakePackageConfigHelpers)
```

### Creating a Package Configuration File

使用`CMakePackageConfigHelpers`模块中的`configure_package_config_file`命令来生成`MathFunctionsConfig.cmake`文件，蓝本是`Config.cmake.in`,同时指定生成后的路径。

```
configure_package_config_file(${CMAKE_CURRENT_SOURCE_DIR}/Config.cmake.in
  "${CMAKE_CURRENT_BINARY_DIR}/MathFunctionsConfig.cmake"
  INSTALL_DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/MathFunctions
)
```

通过`isntall`命令指定`xxxConfig.cmake`和`xxxConfigVersion.cmake`文件安装规则
```
install(FILES
          "${CMAKE_CURRENT_BINARY_DIR}/MathFunctionsConfig.cmake"
          "${CMAKE_CURRENT_BINARY_DIR}/MathFunctionsConfigVersion.cmake"
        DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/MathFunctions
)
```

关于`Config.cmake.in`文件
```
@PACKAGE_INIT@

include("${CMAKE_CURRENT_LIST_DIR}/MathFunctionsTargets.cmake")

check_required_components(MathFunctions)
```

`@PACKAGE_INIT@` 在配置的时候，会被替换和展开，展开后包含
1. 以`PACKAGE_`为前缀的相对路径
2. `set_and_check()` 和 `heck_required_components()`两个宏定义。


`check_required_components` 针对所有的组件，给`<Package>_<Component>_FOUND`变量赋值， 找到为`TRUE`,找不到为`FALSE`。 同时给`<Package>_FOUND`变量赋值， 如果结果为`FALSE`,认为该package没有找到。

`set_and_check`主要给对应的目录和文件路径赋值，如果引用的文件或路径没有找到，该宏执行失败。
### Creating a Package Version File

`CMakePackageConfigHelpers`模块，提供了`write_basic_package_version_file()`命令来生成`xxConfigVersion.cmake`文件。 当`find_package()`命令指定了版本号的时候， cmake 会读取该文件来获取版本号信息做匹配

```
set(version 3.4.1)

set_property(TARGET MathFunctions PROPERTY VERSION ${version})
set_property(TARGET MathFunctions PROPERTY SOVERSION 3)
set_property(TARGET MathFunctions PROPERTY
  INTERFACE_MathFunctions_MAJOR_VERSION 3)
set_property(TARGET MathFunctions APPEND PROPERTY
  COMPATIBLE_INTERFACE_STRING MathFunctions_MAJOR_VERSION
)

# generate the version file for the config file
write_basic_package_version_file(
  "${CMAKE_CURRENT_BINARY_DIR}/MathFunctionsConfigVersion.cmake"
  VERSION "${version}"
  COMPATIBILITY AnyNewerVersion
)
```

1. 设置target的版本号相关的变量
2. 将版本号信息，写入`MathFunctionsConfigVersion.cmake`文件


此时已经配置好如何生成`xxxConfig.cmake`和`xxxConfigVersion.cmake`文件.
执行构建，安装
```
mkdir build 
cd build 
cmake ..
cmake --build .
cmake --install . --prefix `<prefix>`
```

观察输出, 对应的文件已经生成
```
MathFunctionsConfig.cmake
MathFunctionsConfigVersion.cmake
MathFunctionsTargets-noconfig.cmake
MathFunctionsTargets.cmake
```
使用`find_package()`来使用生成config文件, 此时需要通过`CMAKE_PREFIX_PATH`来指定config文件的搜罗路径。

```
cmake_minimum_required(VERSION 3.15)
project(Downstream)

# specify the C++ standard
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED True)

find_package(MathFunctions 3.4.1 EXACT)

add_executable(myexe main.cc)
target_link_libraries(myexe PRIVATE MathFunctions::MathFunctions)
```

注意：
导出配置，不应该引用绝对路径，应当关联相对路径，这样，无论安装在哪里，都可以通过config文件正确索引到库。

1. 不应当显示的依赖`CMAKE_INSTALL_PREFIX`

```
target_include_directories(tgt INTERFACE
  # Wrong, not relocatable:
  $<INSTALL_INTERFACE:${CMAKE_INSTALL_PREFIX}/include/TgtName>
)

target_include_directories(tgt INTERFACE
  # Ok, relocatable:
  $<INSTALL_INTERFACE:include/TgtName>
)
```

2. 可以使用`$<INSTALL_PREFIX> generator expression`

```
target_include_directories(tgt INTERFACE
  # Ok, relocatable:
  $<INSTALL_INTERFACE:$<INSTALL_PREFIX>/include/TgtName>
)
```







