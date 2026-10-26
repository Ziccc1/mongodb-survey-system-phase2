# 第二阶段访问地址与部署

更新日期：2026-10-26。当前本机27019/rs0已启用认证/keyFile，主应用为十三集合 `project2_app_v2`，API通过 `.env.phase2` 的 `MONGODB_AUTH_FILE` 使用受限应用身份。10月25日完成20项权限检查、正常stop/start、API ready、网页登录与发布验证。见[认证配置、角色与启动方法](phase2/authorization-deployment.md)和[最终运行记录](testing/phase2-runs/delivery-20261025/runtime-final.json)。新电脑安装与初始化以[项目README](../README.md#配置与启动)为准，已有认证环境保留原私有凭据。

运行地址为前端 `http://localhost:5200`、API `http://127.0.0.1:3200`。四集合 `project2_app_v1`仅保留兼容基线，使用独立 `.env`；与主应用不能同时占用3200/5200。启动前确认端口及服务归属，已有服务无需重复启动。

新环境依次安装锁定依赖、生成 `.env`及 `.env.phase2`、构建共享包/前后端、启动专用数据库，再执行 `npm.cmd run db:init:phase2`。已有环境日常执行 `npm.cmd run db:start` 和 `npm.cmd run db:verify:phase2`，然后分别启动API与Vite。启动与ready只检查，不自动升级四集合、修复验证器或执行迁移。配置与凭据只保留在部署机器，详见README的首次安装步骤。

构建后用`npm.cmd run build`和`npm.cmd run start:phase2`。若直接在3200使用静态站点，需将**仅.env.phase2**的APP_ORIGIN/PUBLIC_APP_URL一起改成`http://localhost:3200`；使用Vite时恢复5200。局域网规则同下文，但更改phase2配置且用phase2启动命令。

受限角色已由 `scripts/secure-phase2.mjs` 实际部署，角色定义在admin，业务权限限定于 `project2_app_v2`。应用与维护身份分别配置；正式题版、发布快照、答卷和成功回执等集合禁止应用账号更新和删除，模板字段与绑定行的更细约束由应用保证。新环境认证需单独provision、正常重启及verify，不会随新库初始化自动完成。

[← 返回项目总 README](../README.md)


填写者只需要浏览器和账号，无需安装本项目、Node.js 或 MongoDB；必须能够访问承载前端和 API 的服务器。`localhost`、`127.0.0.1` 指向访问者自己的电脑，只适用于本机，复制链接不会自动使服务进入公网。

## 配置约定

主应用配置保存在项目根目录 `.env.phase2`，仅在服务器保存。`APP_ORIGIN` 是允许写请求的唯一精确 Origin（协议、主机、端口）；`PUBLIC_APP_URL` 是分享根地址，必须与它相同，不带末尾 `/` 或子路径。已有配置没有 `PUBLIC_APP_URL` 时沿用显式的 `APP_ORIGIN`，配置脚本不覆盖现有文件。修改后重启相关服务。

`API_HOST` 默认 `127.0.0.1`，可设置 `0.0.0.0` 或 `::1`；`WEB_HOST` 默认 `localhost`，开发局域网访问时设置 `0.0.0.0`。`API_PORT` 默认 3200。服务均不自动开放防火墙。

发布回执和页面“复制链接”使用同一个公开根地址。前端通过服务器生成的 `/app-config.js`（no-store）读取 baseline仅含publicAppUrl；phase2另外只含libraryEnabled=true 的运行配置；Vite 开发服务提供相同白名单资产。没有配置时页面禁用复制并提示；复制失败时选中链接供手动复制。本机地址有“仅限本机”的提示。客户端不读取 `.env`、数据库连接、JWT/CURSOR 密钥；不暴露数据库或密钥。

## 本机开发

```dotenv
APP_ORIGIN=http://localhost:5200
PUBLIC_APP_URL=http://localhost:5200
WEB_HOST=localhost
API_HOST=127.0.0.1
API_PORT=3200
```

在 `.env.phase2` 中设置上述地址，两个终端分别运行 `npm.cmd run dev:api:phase2`、`npm.cmd run dev:web:phase2`。浏览器访问 `http://localhost:5200`，与配置的Origin保持一致。Vite同源代理 `/api` 到本机API，运行配置资产由开发服务提供。`npm.cmd run configure:phase2`仅首次生成配置，不覆盖已有文件。

## 同一局域网开发访问

先用 `ipconfig` 找到其他设备可达的有线／Wi-Fi IPv4，下面 **192.168.1.20 仅是示例**，不要选虚拟网卡或照抄。在 `.env.phase2` 配置：

```dotenv
APP_ORIGIN=http://192.168.1.20:5200
PUBLIC_APP_URL=http://192.168.1.20:5200
WEB_HOST=0.0.0.0
API_HOST=127.0.0.1
API_PORT=3200
```

通过 `dev:api:phase2` 和 `dev:web:phase2` 重启API与Vite，本机及其他设备均用 `http://192.168.1.20:5200`；填写分享链接也是该地址。前端开发服务器监听所有网卡，API 仍只监听回环，通过 Vite 代理访问，其他设备无需访问 3200 或数据库。必要时由维护者只向可信专用网络允许 TCP 5200；检查路由器 AP 隔离、防火墙、设备是否处于同一网络。不要通过开放任意 CORS 或移除 Origin 校验处理问题。配置只支持一个写请求 Origin，切换本机/LAN入口后应统一使用所配置地址。

## 构建后同源服务与域名部署准备

先 `npm.cmd run build`。本机直连构建版使用 APP_ORIGIN/PUBLIC_APP_URL=`http://localhost:3200`，`npm.cmd run start:phase2`；局域网直连可以改成实际 LAN IP:3200 并设置 API_HOST=0.0.0.0，只开放该 HTTP 端口。切回开发需恢复 5200 配置并重启。

以后通过域名访问时，例如 `https://survey.example.com`：两个 URL 均设为该域名，API_HOST=127.0.0.1；Node 服务负责静态 dist、SPA 回退、`/app-config.js` 和 `/api/v1`，Nginx/Caddy 将域名下所有请求代理到 `http://127.0.0.1:3200`。DNS 指向服务器，反向代理配置正式 TLS 证书，转发 Host 和 X-Forwarded-Proto；HTTPS Origin 会使认证 cookie 使用 Secure。这样前后端同源，无需 CORS。域名变化不需要重新编译前端，需更新服务器配置并重启；不能只把 dist 上传静态托管而遗漏运行配置资产和 API 代理。

局域网及域名部分是部署准备说明，未验证第二台设备或公网访问。当前本机MongoDB保持回环监听，已启用认证、应用/维护账号分权，并保留迁移与认证前备份；生产服务器仍需单独安排进程运维、网络及备份恢复。浏览器通过API访问业务数据。

## 第一阶段历史实际范围（2026-10-17）

本机页面和独立测试服务已验证。测试服务绑定 0.0.0.0，通过本机非回环接口 `172.18.208.1:3110` 成功访问健康检查和公开配置，错误 Origin 返回403；该地址是本次环境选择的网卡，**不作为可用 Wi-Fi 分享地址建议**。未用第二台设备验证网络/防火墙，另启真实Vite测试监听0.0.0.0，以172.18.208.1:5181访问运行配置及/api代理健康均200，测试结束已停止临时进程；当时业务开发服务保持localhost:5173；当前P2默认5200。没有公网可用性验证。

[← 返回项目总 README](../README.md)

## P2-W01历史实测（2026-10-22）

2026-10-22实际启动构建版API（127.0.0.1:3200）及Vite（localhost:5200），首页、live/ready、公开配置白名单及错误Origin拒绝共10项通过；结束后这两个应用进程已释放，P2专用MongoDB保留。原回归中192.168.80.1:3110同机LAN探测通过，但未验证第二台设备/防火墙路径或公网。真实日志见[本轮证据](testing/phase2-runs/P2-005-20261022T123358Z/README.md)。

`configure`现在对已有.env也严格校验P2目标并保持字节；Vite端口取PUBLIC_APP_URL，不能只改Origin而让服务仍固定旧5173。浏览器仍只读取publicAppUrl，不获得数据库或密钥。MongoDB停止使用`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-mongo.ps1`，重启`npm.cmd run db:start`；先停前台API/Vite，禁止照旧PID杀进程或删除数据目录。

## P2运行复审及后续接入

API直接启动也会在连接前验证当前项目的MongoDB标记、目录和监听进程，连接后复核实际服务器PID/参数/rs0；不依赖操作者先执行db:start。源码与编译版均依模块位置找到同一归属脚本，需本机进程/CIM及实例诊断可读权限，无法核实则拒绝。冒烟不接管已有端口服务，核对本轮直接子进程的监听PID。主应用日常使用 `npm.cmd run db:verify:phase2`，四集合基线另用verifyruntime报告数量；verifyinitial仅检查四集合基线首次空库前提；不要为使核验通过而删数据。详见[三项复审及真实证据](phase2/runtime-baseline.md#w01-runtime-review)。

W06新增模板与公开授权仍由同一phase2入口运行，不另建服务、库或新增部署依赖。角色模板对survey_templates/template_grants开放find/insert/update，不开放remove；模板不可变内容由应用服务控制，数据库角色不能限制更新字段。W06当轮尚未部署认证；后续10月25日已实际启用并完成受限角色验证，当前状态以[认证部署](phase2/authorization-deployment.md)为准。原W06轮次范围见[历史实施说明](phase2/template-square.md)。
