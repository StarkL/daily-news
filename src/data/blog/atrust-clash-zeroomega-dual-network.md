---
author: 晴天（转自 boke.hackerdream.xyz）
pubDatetime: 2026-06-01T23:00:00Z
title: Docker 跑 aTrust + Clash TUN：Windows 上内网外网同时在线的终极方案
slug: atrust-clash-zeroomega-dual-network
featured: false
draft: false
tags:
  - Docker
  - Clash
  - aTrust
  - WSL2
  - VPN
  - 代理
description: 在公司开发时 aTrust 和 Clash TUN 抢路由表，把 aTrust 塞进 Docker，只暴露代理端口；宿主机用 Clash TUN 统一流量分流，内外网并行互不干扰。
timezone: Asia/Shanghai
---

> 本文转载自 [boke.hackerdream.xyz](https://boke.hackerdream.xyz/posts/atrust-clash-zeroomega-dual-network/)，作者晴天，发布于 2026-06-01。

---

在公司开发，你可能遇到过一个经典困境：

- **访问公司内网**，必须开 Windows 版 aTrust（公司 VPN 客户端）
- **使用 Google Antigravity / Cursor AI / 外网服务**，必须开 Clash 的 **TUN 模式**
- **两者同时开**——路由表冲突，内网或外网只能活一个

这不是配置错误，而是底层机制决定的。两个 VPN 级网络组件都在抢系统路由表，必然有一个被打败。

这篇文章给出一个经过生产验证的方案：**把 aTrust 塞进 Docker，只暴露代理端口；宿主机用 Clash TUN 统一流量分流。** 内外网并行，互不干扰。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Windows 宿主机                                              │
│                                                              │
│  浏览器 ──► ZeroOmega ──► SOCKS5 127.0.0.1:1080 ──┐         │
│  Antigravity / 外网 ──► Clash TUN ──► 机场节点      │         │
│  内网 IP（非浏览器）──► Clash 规则 ──► 公司内网 ────┤         │
│                                                    ▼         │
│                              Docker (WSL2)                   │
│                              hagb/docker-atrust              │
│                              aTrust VPN → 公司内网           │
└─────────────────────────────────────────────────────────────┘
```

| 组件 | 作用 |
|------|------|
| **Docker aTrust** | 公司 VPN，提供 `1080`(SOCKS5) / `8888`(HTTP) 代理端口 |
| **Clash Verge Rev** | TUN 抓系统流量 + 规则分流 |
| **ZeroOmega** | 浏览器代理扩展，内网流量直接走 `1080`，不经过 Clash |

核心思路就一句话：**把抢路由表的对手变成合作者。** aTrust 不再碰宿主机路由表，它只在容器里建 VPN，然后通过代理端口把内网流量送出来。

---

## 二、环境准备

### 2.1 软件清单

| 软件 | 说明 |
|------|------|
| **WSL2 + Ubuntu** | 跑 Docker 容器 |
| **Docker Desktop** 或 WSL 内 Docker | 容器运行时 |
| **Clash Verge Rev** | 带 TUN + Merge + Script 功能的 Clash 客户端 |
| **ZeroOmega** | SwitchyOmega 的继任者，浏览器代理扩展 |
| **TightVNC Viewer** | 登录容器内的 aTrust 图形界面 |
| **机场订阅** | 已导入 Clash |

### 2.2 拉取 aTrust 镜像

国内 Docker Hub 访问不稳定，建议用华为云镜像加速：

```bash
wsl -d Ubuntu -u root -e bash -lc "docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/hagb/docker-atrust:latest && docker tag swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/hagb/docker-atrust:latest hagb/docker-atrust:latest"
```

镜像 `hagb/docker-atrust` 是一个封装了 aTrust Linux 版 + VNC + SOCKS5/HTTP 代理的容器。

---

## 三、首次部署

### 3.1 docker-compose 配置

创建 `atrust-docker/` 目录，编写 `docker-compose.yml`：

```yaml
version: "3"
services:
  atrust:
    image: hagb/docker-atrust:latest
    container_name: atrust
    privileged: true
    devices:
      - /dev/net/tun:/dev/net/tun
    ports:
      - "5901:5901"     # VNC 端口
      - "1080:1080"     # SOCKS5 代理
      - "8888:8888"     # HTTP 代理
    environment:
      - PASSWORD=123456  # VNC 密码，按需修改
    volumes:
      - ./data:/root/.config  # 持久化登录状态
    restart: unless-stopped
```

关键点：

- `privileged: true` + `/dev/net/tun`：容器内需要创建 TUN 设备建 VPN
- `./data` 持久化：aTrust 登录状态保存在这里，不用每次重新登录

### 3.2 启动容器

```bash
wsl -d Ubuntu -u root -e bash -lc "service docker start; cd /mnt/d/changjuyi/aerovisionlink/atrust-docker && docker compose up -d"
```

或者写成 `start-atrust.bat` 放在桌面，双击即可。

### 3.3 VNC 登录 aTrust

打开 TightVNC Viewer：

| 项 | 值 |
|------|------|
| 地址 | `127.0.0.1::5901`（注意**双冒号**格式） |
| 密码 | `123456`（与 docker-compose 中 PASSWORD 一致） |

在 VNC 窗口中完成：公司门户地址、账号、密码、**手机验证码**。

登录成功后，容器内的 aTrust 就建好了到公司内网的 VPN 隧道。

### 3.4 验证代理是否可用

```bash
# SOCKS5（日常推荐）
curl.exe -x socks5://127.0.0.1:1080 -s -o NUL -w "socks5: %{http_code} time:%{time_total}s\n" --max-time 15 http://10.43.95.81:8181/
# HTTP（1080 卡死时临时用）
curl.exe -x http://127.0.0.1:8888 -s -o NUL -w "http: %{http_code} time:%{time_total}s\n" --max-time 15 http://10.43.95.81:8181/
```

期望结果：`200`，SOCKS5 耗时通常 **< 2 秒**。

### 3.5 卸载 Windows 原生 aTrust

> **重要**：不要与 Docker 版同时运行。Windows 原生 aTrust 会抢路由表，直接破坏整个方案。

控制面板 → 卸载 aTrust。

---

## 四、Clash Verge 配置

### 4.1 必备设置

| 设置 | 值 | 说明 |
|------|------|------|
| **代理模式** | **规则** | ❌ 不要用「全局」，内网会走机场 |
| **TUN / 虚拟网卡** | **开启** | Antigravity 等外网需要 |
| **当前订阅** | 你的机场订阅 | 已绑定 Merge + Script |

### 4.2 Merge 配置（核心）

路径：`配置 → 你的订阅 → 合并(Merge)`

```yaml
mode: rule
prepend-proxies:
  - name: 公司内网
    type: socks5
    server: 127.0.0.1
    port: 1080
    udp: true

prepend-rules:
  - IP-CIDR,10.0.0.0/8,公司内网
  - IP-CIDR,172.16.0.0/12,公司内网
  - IP-CIDR,192.168.0.0/16,公司内网

delete-rules:
  - GEOSITE,private,DIRECT
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve

tun:
  enable: true
  stack: mixed
  auto-route: true
  auto-detect-interface: true
  strict-route: true
```

**三个关键操作：**

1. **`prepend-proxies`** 注入「公司内网」SOCKS5 节点——不能用 `proxies:`，会覆盖机场节点导致内核报错
2. **`prepend-rules`** 在最前面插入内网 IP 段规则，确保内网流量优先匹配
3. **`delete-rules`** 删除机场订阅里自带的 `10.x → DIRECT` 规则——这些规则会让内网直连，不走代理

### 4.3 脚本覆写（Script，可选但推荐）

Clash Verge Rev 支持 JavaScript 脚本覆写配置。作用是：

- 强制 `mode: rule`
- 注入「公司内网」SOCKS5 节点
- 删除 `10.x → DIRECT` 冲突规则
- 内网 Sniffer 跳过

修改后需要：**重新加载配置** 或 **重启内核**。

### 4.4 常见 Clash 错误

| 现象 | 原因 | 处理 |
|------|------|------|
| 内核通信错误 | Merge 用了 `proxies:` 覆盖节点 | 改 `prepend-proxies` |
| `自动选择 proxies missing` | 同上 | 重新加载配置 |
| 内网 `using GLOBAL` | **全局模式** | 改 **规则模式** |
| 内网 `using DIRECT` + 超时 ~10s | 订阅里 `10.x DIRECT` | Merge delete-rules + 脚本清理 |

---

## 五、ZeroOmega 配置（浏览器内网路由）

为什么需要 ZeroOmega？因为浏览器访问内网系统（如 OA、Jira、内部 API 文档）时，走 Clash 会多一层代理开销，且 Clash 日志里会暴露内网 IP。**ZeroOmega 让浏览器内网流量直接到 Docker 的 `1080`，更快、更干净。**

### 5.1 新建「公司内网」情景

| 项 | 值 |
|------|------|
| 类型 | 代理服务器 |
| 协议 | **SOCKS5** |
| 服务器 | `127.0.0.1` |
| 端口 | **1080** |

### 5.2 SOCKS5 vs HTTP：选哪个？

| 端口 | 协议 | 特点 | 适用场景 |
|------|------|------|------|
| **1080** | SOCKS5 | 接口快，适合 API 调用 | 日常开发（推荐） |
| **8888** | HTTP | 页面加载快，但 API 每个 10-12 秒 | 仅当 1080 卡死时临时用 |

HTTP 模式走的是容器内的 tinyproxy，大量并发 API 请求时会排队阻塞。SOCKS5 走 danted，性能更好但偶发挂死。

### 5.3 auto switch 规则（可选）

| 条件 | 情景 |
|------|------|
| `10.*` | 公司内网 |
| `*.公司域名.com` | 公司内网（按实际填写） |
| **默认** | **直接连接** |

> **注意**：访问**纯 IP** 内网（如 `http://10.43.95.81:8181/`）时，`10.*` 规则不一定生效。建议直接**手动切换到「公司内网」**。

### 5.4 验证是否走 ZeroOmega

浏览器 F12 → Network → 任选内网请求：

- **远程地址** 应为 `127.0.0.1:1080` 或 `127.0.0.1:8888`
- **Via** 头含 `tinyproxy` 表示经 Docker HTTP；SOCKS5 无 Via 也正常
- Clash 日志里**搜不到**内网 IP → 说明浏览器未走 Clash，符合预期

---

## 六、分工一览

| 场景 | 走哪条路 |
|------|------|
| 浏览器访问内网系统 | ZeroOmega → SOCKS5 **1080** |
| Antigravity / Cursor AI | Clash **TUN** + 规则 → 机场 |
| 外网 / Google | Clash 规则 → 机场 |
| Postman / 非浏览器访问内网 | Clash 规则 → **公司内网**（1080） |
| 仅内网、不用 AI | 可关 Clash TUN，只开 ZeroOmega |

---

## 七、每次开机流程

```
1. start-atrust.bat          → 启动 Docker 容器
2. VNC 127.0.0.1::5901       → 若 aTrust 未连接则重新登录
3. 打开 Clash Verge          → 规则模式 + TUN 开启
4. 配置 → 重新加载           → 若改过 Merge
5. ZeroOmega → 公司内网      → 访问内网系统
6. 开发 Antigravity          → 靠 Clash TUN，无需改 Omega
```

### 自检命令

```bash
# 容器是否在运行
wsl -d Ubuntu -u root -e docker ps --filter name=atrust

# 内网代理是否可达
curl.exe -x socks5://127.0.0.1:1080 -s -o NUL -w "%{http_code}\n" http://10.43.95.81:8181/
```

---

## 八、故障排查

### 8.1 内网完全打不开

排查顺序：

1. 容器是否运行：`docker ps --filter name=atrust`
2. VNC 里 aTrust 是否**已连接**
3. `curl` 测 1080 是否 `200`
4. ZeroOmega 是否选了**「公司内网」**（非直接连接）
5. Clash 是否误开了**全局模式**

### 8.2 页面卡 1-2 分钟（SOCKS5 挂死）

danted SOCKS5 偶发挂死：

```bash
wsl -d Ubuntu -u root -e bash -lc "cd /mnt/d/changjuyi/aerovisionlink/atrust-docker && docker compose restart"
```

临时方案：把 ZeroOmega 改为 **HTTP 8888** 打开页面，接口仍建议用 1080。

### 8.3 接口每个 10-12 秒

- 若走 **8888 HTTP**：改回 **SOCKS5 1080**
- F12 看是否 **123+ 请求**、是否勾选了**停用缓存**
- 检查前端是否有**重复请求**（如 `getInfoNew` 被反复调用）

### 8.4 Clash 日志解读

| 日志 | 含义 | 处理 |
|------|------|------|
| `using GLOBAL` | 全局模式，内网走了机场 | 改规则模式 |
| `using DIRECT` + 10.x 超时 | 订阅的 DIRECT 规则冲突 | 删除 DIRECT 规则 |
| `using 公司内网` | 分流正确 | 无需处理 |
| 搜不到内网 IP | 浏览器走 ZeroOmega | 正常 |

### 8.5 内核通信错误

- Merge 配置**勿用** `proxies:`，必须用 `prepend-proxies`
- 设置 → **重启内核**

---

## 九、安全与注意事项

1. **aTrust 登录数据**在 `atrust-docker/data/`，不要提交到 Git
2. 容器需要 `--privileged` 和 `/dev/net/tun` 才能建 VPN
3. WSL 重启后需手动 `service docker start` 或运行 `start-atrust.bat`
4. 公司内网 IP 段以 aTrust 实际下发为准，示例为 `10.x` / `172.16-31.x` / `192.168.x`
5. **卸载 Windows 原生 aTrust**，这是最容易踩的坑

---

## 十、总结

- **问题**：aTrust 和 Clash TUN 同时开，抢路由表，内外网二选一
- **方案**：aTrust 容器化 → Docker 内建 VPN → 暴露 SOCKS5 代理 → Clash 规则分流 + ZeroOmega 浏览器路由
- **效果**：内网走 1080，外网走机场，互不干扰
- **关键配置**：`prepend-proxies` 注入节点、`delete-rules` 清除冲突、规则模式（非全局）
- **日常流程**：启动容器 → VNC 登录 → Clash TUN → ZeroOmega 切换

> 与其让两个 VPN 抢路由表，不如让一个退到容器里做代理。架构上的一个转身，换来的是每天的流畅开发。

---

*原文：[Docker 跑 aTrust + Clash TUN：Windows 上内网外网同时在线的终极方案](https://boke.hackerdream.xyz/posts/atrust-clash-zeroomega-dual-network/) · 作者：晴天 · 许可协议：CC BY-NC-SA 4.0*
