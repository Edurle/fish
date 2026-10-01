# fish — 大鱼吃小鱼

纯前端大鱼吃小鱼游戏：Canvas 2D + TypeScript + Vite，无任何运行时依赖。
电脑（键鼠）与手机（触屏）均可游玩，存档保存在浏览器 localStorage。

## 开发调试

```bash
npm install
npm run dev
```

dev server 会监听局域网地址（`--host`），手机连同一 Wi-Fi 后直接访问终端里打印的地址即可调试。

## 构建

```bash
npm run build     # 产物输出到 dist/，可部署到任意静态托管
npm run preview   # 本地预览构建产物
```

## 目录结构

```
src/
  main.ts              入口：创建 Game 并启动主循环
  core/
    Game.ts            主对象：画布/DPR/主循环/全局系统
    SceneManager.ts    场景状态机（title / game / gameOver）
    Input.ts           统一输入（键盘 + 鼠标/触摸 Pointer Events）
    Storage.ts         localStorage 存档封装（版本化、读写容错）
  scenes/              各场景的玩法逻辑
  entities/Fish.ts     鱼实体与程序化绘制
  render/Backdrop.ts   水下背景（渐变 + 气泡）
```

> 设计文档与变更记录存放在 Obsidian vault 的 `Fish` 文件夹，不在本仓库内维护。
