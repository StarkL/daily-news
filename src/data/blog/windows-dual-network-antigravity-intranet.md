---
author: Horizon
pubDatetime: 2026-06-16T23:00:00Z
title: Windows 双网并行方案：Antigravity IDE + 公司内网 + 本地开发
slug: windows-dual-network-antigravity-intranet
featured: false
draft: false
tags:
  - Windows
  - WSL2
  - Podman
  - Clash
  - aTrust
  - ZeroOmega
  - 网络配置
  - 开发环境
description: 把 aTrust 塞进 WSL2 Podman 容器只暴露代理端口，Clash TUN 负责规则分流，ZeroOmega 处理浏览器内网路由，实现 Antigravity IDE（外网）+ 公司内网 + 本地开发三者并行不冲突。
timezone: Asia/Shanghai
---

> 本文基于实际运行环境整理，只描述当前在用的技术方案。整理日期：2026-06-16。

---

## 一、要解决的三个问题

| # | 问题 | 网络要求 | 典型场景 |
|:--|:-----|:--------|:---------|
| 1 | **使用 Google AI 编辑器 Antigravity IDE** | 访问 Google 服务（外网） | AI 辅助编码、Gemini API |
| 2 | **访问公司内网** | 走 aTrust VPN（内网） | OA、Jira、内部 API、测试环境 |
| 3 | **本地开发 + Git 提交** | 两者都需要 | 推 GitHub（外网）+ 推公司 GitLab（内网）；Vite 代理到内网 API |

### 核心矛盾

- **Antigravity IDE** 依赖 Google 网络，必须通过代理/机场访问外网
- **aTrust**（公司 VPN）安装后会接管系统路由表
- **Clash TUN** 同样会创建虚拟网卡接管路由表
- 两者同时运行 → **路由表冲突，内网或外网只能活一个**

### 为什么 Clash 必须用规则模式？

| 模式 | 流量走向 | 后果 |
|:-----|:---------|:-----|
| **全局模式** | 所有流量 → 机场节点 | 钉钉、微信、腾讯会议等国内服务走海外机场，访问不了或极慢 |
| **规则模式** | 国内流量 → 直连；内网 IP → aTrust；海外 → 机场 | 各走各的，互不影响 |

所以 Clash **必须开规则模式 + TUN**，不能开全局。

### 解决方案

**把 aTrust 塞进 WSL2 Podman 容器，只暴露代理端口，不碰宿主机路由表。Clash TUN 负责规则分流。**

---

## 二、整体架构

```
┌─────────────────────── Windows 宿主机 ────────────────────────────┐
│                                                                      │
│  ┌─ 浏览器 ─► ZeroOmega ─► SOCKS5 {WSL_IP}:1080 ─────────┐        │
│  │   (内网OA/Jira)        (自动切换，绕过Clash)             │        │
│  │                                                            │        │
│  ├─ Antigravity IDE ─► Clash TUN ─► 机场节点 ──► Google      │       │
│  │                                                            │        │
│  ├─ Postman/Git ─► Clash 规则分流 ─┬─ 内网IP → aTrust代理   │       │
│  │                                 └─ 外网 → 机场             │       │
│  │                                                            │        │
│  ├─ Vite 本地开发 ► 127.0.0.1:18080 ─┐                      │        │
│  │   (localhost:9999)                  ▼                      │        │
│  │                        wsl-port-forward.py (WSL内)         │        │
│  │                        HTTP CONNECT 隧道                    │        │
│  └─────────────────────────────────────┼──────────────────────┘        │
                                        │                                 │
┌─────────────────── WSL2 Ubuntu ──────┼───────────────────────────────
│                                       ▼                                 │
│                          ┌────────────────────────┐                    │
│                          │  Podman 容器 (atrust)    │                    │
│                          │  内部IP: 10.88.0.2       │                    │
│                          │  SOCKS5 :1080            │                    │
│                          │  HTTP   :8888            │                    │
│                          │  VNC    :5901            │                    │
│                          │  aTrust VPN 隧道          │                    │
│                          └─────────────────────────┘                    │
│                                   ▼                                       │
│                        ┌── 公司内网 ──┐                                  │
│                        │ 10.43.86.213  │                                 │
│                        │ 10.43.86.249  │                                 │
│                        └───────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、技术栈

| 组件 | 版本/规格 | 职责 |
|:-----|:---------|:-----|
| **WSL2 + Ubuntu** | 22.04 | 容器运行环境 |
| **Podman** | 4.9.3 | 容器运行时，运行 aTrust |
| **hagb/docker-atrust** | latest | aTrust Linux 版 + VNC + 代理 |
| **Clash Verge Rev** | — | TUN + 规则模式，统一流量分流 |
| **ZeroOmega** | Chrome 扩展 | 浏览器内网流量直走 aTrust 代理 |
| **wsl-port-forward.py** | Python 3 | Vite 开发代理桥接到内网 API |
| **git-proxy-on.bat** | — | git 全局代理（保底方案） |

---

## 四、完整链路详解

### 4.1 Antigravity IDE → Google

```
Antigravity IDE
  → Clash TUN（系统级抓包）
  → Clash 规则匹配：Google AI 域名 → 机场
  → 机场节点 → Google 服务
```

Clash Merge 中明确指定以下域名走机场：
- `daily-cloudcode-pa.googleapis.com`
- `gemini.google.com`
- `generativelanguage.googleapis.com`
- `ai.google.dev`

### 4.2 浏览器 → 公司内网

```
浏览器访问 http://10.43.x.x:port/
  → ZeroOmega 自动切换规则匹配：
      10.*  / 172.16-31.*  / 192.168.*  / *.tower.com  / *.chinamobile.com
  → 直走 SOCKS5 {WSL_IP}:1080（Podman 容器端口）
  → aTrust VPN 隧道
  → 公司内网
```

ZeroOmega 情景配置：

| 情景 | 用途 |
|:-----|:-----|
| **公司内网自动切换** | 日常使用，自动识别内网 IP 走代理 |
| **公司内网** | SOCKS5 {WSL_IP}:1080，手动强制 |
| **公司内网HTTP** | HTTP {WSL_IP}:8888，SOCKS5 卡死时备用 |
| **直接连接** | 让 Clash TUN 接管 |

> WSL2 重启后 IP 会变，需更新 ZeroOmega 情景中的 server 地址。

### 4.3 Postman / Git → 公司内网（经 Clash 规则）

```
Postman / Git
  → Clash TUN 抓包
  → Clash 规则匹配：IP-CIDR 10.0.0.0/8 → 「公司内网」节点
  → 「公司内网」节点 = SOCKS5 127.0.0.1:1080
  → aTrust VPN 隧道 → 公司内网
```

### 4.4 Vite 本地开发 → 内网 API

```
浏览器 localhost:9999
  → Vite 代理 (target: http://127.0.0.1:18080)
  → WSL 端口穿透
  → wsl-port-forward.py 监听 18080
  → HTTP CONNECT 隧道 → 容器 HTTP 代理 127.0.0.1:8888
  → aTrust VPN 隧道
  → 内网 API
```

端口映射表：

| 本地端口 | 内网目标 | 用途 |
|:---------|:---------|:-----|
| `18080` | `10.43.86.213:80` | 核心 API / 瓦片服务 |
| `19898` | `10.43.86.213:9898` | 商城服务 |
| `19106` | `10.43.86.249:19106` | 数字人后台 |
| `12102` | `10.43.86.213:12102` | apiserver 网关 |

> 所有 Vite 代理 target 必须写 `127.0.0.1`，不能写 `localhost`。Node.js v17+ 会把 localhost 解析为 IPv6 `::1`，WSL 端口映射只支持 IPv4。

### 4.5 Git 提交

Clash TUN 模式下 git 流量已被系统级接管，通常不需要额外配置。

保底方案（关闭 TUN 时）：

```powershell
# 设置 git 全局代理
git config --global http.proxy socks5://{WSL_IP}:1080

# 移除代理
git config --global --unset http.proxy
```

---

## 五、Clash Verge Rev 配置

### 必备设置

| 设置 | 值 |
|:-----|:---|
| 代理模式 | **规则**（不要全局） |
| TUN | **开启** |

### Merge 配置

```yaml
mode: rule

prepend-proxies:
  - name: 公司内网
    type: socks5
    server: 127.0.0.1
    port: 1080
    udp: true

prepend-rules:
  # 公司内网网段
  - IP-CIDR,10.0.0.0/8,公司内网
  - IP-CIDR,172.16.0.0/12,公司内网
  - IP-CIDR,192.168.0.0/16,公司内网

  # 钉钉直连
  - DOMAIN-SUFFIX,dingtalk.com,DIRECT
  - DOMAIN-SUFFIX,ddurl.to,DIRECT
  - DOMAIN-SUFFIX,alicdn.com,DIRECT

  # 微信直连
  - DOMAIN-SUFFIX,weixin.qq.com,DIRECT
  - DOMAIN-SUFFIX,wechat.com,DIRECT
  - DOMAIN-SUFFIX,qpic.cn,DIRECT
  - DOMAIN-SUFFIX,qlogo.cn,DIRECT

  # DeepSeek 直连
  - DOMAIN-SUFFIX,deepseek.com,DIRECT
  - DOMAIN-SUFFIX,deepseek.io,DIRECT

  # Antigravity / Google AI 走机场
  - DOMAIN,daily-cloudcode-pa.googleapis.com,机场
  - DOMAIN-SUFFIX,gemini.google.com,机场
  - DOMAIN-SUFFIX,generativelanguage.googleapis.com,机场
  - DOMAIN-SUFFIX,ai.google.dev,机场

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
  dns-hijack:
    - 0.0.0.0:53

dns:
  enable: true
  listen: 0.0.0.0:53
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - 223.5.5.5
    - 8.8.8.8
  fallback:
    - tls://8.8.8.8:853
    - tls://1.1.1.1:853
```

> 关键点：必须用 `prepend-proxies`（不能用 `proxies:`，会覆盖机场节点）；必须用 `delete-rules` 删掉订阅自带的 `10.x → DIRECT` 规则。

---

## 六、Podman aTrust 部署

### podman-compose.yml

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
      - PASSWORD=123456
    volumes:
      - ./data:/root/.config
    restart: unless-stopped
```

### 启动 & VNC 登录

```bash
# 启动容器
wsl -d Ubuntu -u root -e bash -lc "podman start atrust"

# VNC 登录（TightVNC Viewer）
# 地址：127.0.0.1::5901（双冒号）
# 密码：123456
# 在 VNC 窗口完成 aTrust 登录
```

### 拉取镜像（国内加速）

```bash
wsl -d Ubuntu -u root -e bash -lc "podman pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/hagb/docker-atrust:latest"
```

---

## 七、日常启动流程

### 每次开机

```
1. podman start atrust       → 启动 aTrust 容器
2. VNC 127.0.0.1::5901       → 若 aTrust 未连接则重新登录
3. 打开 Clash Verge           → 规则模式 + TUN 开启
4. ZeroOmega → 公司内网自动切换
5. wsl-port-forward.py (WSL内) → 本地开发时启动
6. pnpm dev                   → 启动开发服务
```

### 首次部署

```
1. 卸载 Windows 原生 aTrust（控制面板 → 程序和功能）
2. WSL 内安装 Podman
3. 拉取 aTrust 镜像（华为云加速）
4. 运行 podman-compose.yml 创建容器
5. VNC 登录 aTrust
6. 配置 Clash Verge Rev（Merge + TUN + 规则模式）
7. 安装 ZeroOmega，导入 zeroomega-config.json
8. 准备 wsl-port-forward.py
```

---

## 八、故障排查

### 内网打不开

```
1. podman ps    → 容器在跑？
2. VNC 看 aTrust 连接状态  → VPN 隧道建了？
3. curl -x socks5://127.0.0.1:1080  → 代理可达？
4. ZeroOmega 是否选了「公司内网自动切换」 → 不是「直接连接」
5. Clash 是否是规则模式  → 不是「全局」
```

### Antigravity 无法连接 Google

```
1. Clash TUN 是否开启？
2. 是否规则模式？
3. 机场订阅是否正常？
```

### Vite 代理报 500 / ECONNREFUSED

```
1. wsl-port-forward.py 是否在 WSL 内运行？
2. target 是否写的 127.0.0.1（不是 localhost）？
3. .env.development 中地址是否指向本地映射端口？
```

### SOCKS5 卡死

```bash
# 重启容器（重启后需等 50s 让 SDP 同步）
wsl -d Ubuntu -u root -e bash -lc "podman restart atrust"

# 临时方案：ZeroOmega 切到「公司内网HTTP」(8888)
```

---

## 九、安全注意事项

1. `atrust-docker/data/` 包含 aTrust 登录数据，**不要提交到 Git**
2. 容器需要 `--privileged` + `/dev/net/tun` 才能建 VPN
3. **不要同时运行 Windows 原生 aTrust**
4. WSL 重启后 IP 会变，需更新 ZeroOmega 情景中的 server 地址
5. 容器重启后需等 **50s** 让 SDP 配置同步
6. WSL 内存已限制为 1536MB（`.wslconfig`）

---

## 附录：常用命令

```powershell
# 容器状态
wsl -d Ubuntu -u root -e podman ps --filter name=atrust

# 内网连通性测试
curl.exe -x socks5://127.0.0.1:1080 -s -o NUL -w "%{http_code}" http://10.43.86.213

# WSL IP
wsl -d Ubuntu -- bash -c "hostname -I"
```
