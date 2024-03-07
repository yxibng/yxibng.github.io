---
layout: post
title: "ffmpeg+nginx+rtmp搭建本地推流服务器"
date: 2022-03-13 
tag: ffmpeg
---

## 安装[nginx](https://github.com/denji/homebrew-nginx)+[rtmp](https://github.com/sergey-dryabzhinsky/nginx-rtmp-module)

```
brew tap denji/nginx
brew install nginx-full --with-rtmp-module
```

## 配置`nginx.conf`,路径`/opt/homebrew/etc/nginx/nginx.conf`

```
rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        # live on
        application rtmp_live {
            live on;
            # hls on; #这个参数把直播服务器改造成实时回放服务器。
            # wait_key on; #对视频切片进行保护，这样就不会产生马赛克了。
            # hls_path ./sbin/html; #切片视频文件存放位置。
            # hls_fragment 10s;     #每个视频切片的时长。
            # hls_playlist_length 60s;  #总共可以回看的时间，这里设置的是1分钟。
            # hls_continuous on; #连续模式。
            # hls_cleanup on;    #对多余的切片进行删除。
            # hls_nested on;     #嵌套模式。
        }

        # play videos
        application rtmp_play{
            play ./videos;  #build directory
        }
    }
}
```

更多配置参考:[example-nginxconf](https://github.com/sergey-dryabzhinsky/nginx-rtmp-module#example-nginxconf)

### 重启 nginx

```
Reload config:
 $ nginx -s reload
Reopen Logfile:
 $ nginx -s reopen
Stop process:
 $ nginx -s stop
Waiting on exit process
 $ nginx -s quit
```

## 使用ffmpeg 推流

```
ffmpeg -re -i test.flv -vcodec libx264 -acodec aac -strict -2 -f flv rtmp://localhost:1935/$app/$name
```

上面定义的app叫rtmp_live，假设name=video

```
ffmpeg -re -i test.flv -vcodec libx264 -acodec aac -strict -2 -f flv rtmp://localhost:1935/rtmp_live/video
```

## 使用ffplay拉流或者vlc拉流

```
ffplay rtmp://localhost:1935/rtmp_live/video
```

---

参考：

[MACOS上搭建nginx+rtmp环境](https://github.com/guoxiaopang/LiveExplanation/blob/master/MACOS%E4%B8%8A%E6%90%AD%E5%BB%BAnginx%2Brtmp%E7%8E%AF%E5%A2%83.md)


