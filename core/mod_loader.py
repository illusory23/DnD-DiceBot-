"""骰娘 Mod 加载器（Flask 版）

自动扫描 mods/ 目录，加载有效的 Mod 并注册路由。
"""

import json
import sys
import importlib.util
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("dicebot.mod_loader")


class ModLoader:
    """Mod 发现与加载管理器"""

    def __init__(self, mods_dir: str | Path):
        self.mods_dir = Path(mods_dir)
        self.loaded: dict[str, dict] = {}   # mod_id → mod_info
        self._modules: dict[str, Any] = {}  # 已导入的模块

    # ━━━━ 发现 ━━━━

    def discover(self) -> list[dict]:
        """扫描 mods_dir，返回所有有效的 mod.json 内容列表。"""
        manifests = []

        if not self.mods_dir.exists():
            logger.info(f"Mod目录不存在: {self.mods_dir}")
            return manifests

        for mod_dir in sorted(self.mods_dir.iterdir()):
            if not mod_dir.is_dir() or mod_dir.name.startswith('.') or mod_dir.name.startswith('_'):
                continue

            mod_json = mod_dir / 'mod.json'
            if not mod_json.exists():
                logger.warning(f"跳过无mod.json的目录: {mod_dir.name}")
                continue

            try:
                with open(mod_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                logger.warning(f"mod.json解析失败 [{mod_dir.name}]: {e}")
                continue

            # 确保id字段存在
            if 'id' not in data:
                data['id'] = mod_dir.name
            data['_dir'] = str(mod_dir)
            manifests.append(data)

        manifests.sort(key=lambda m: m.get('id', ''))
        return manifests

    # ━━━━ 加载 ━━━━

    def load_mod(self, mod_info: dict, app) -> bool:
        """加载单个Mod到Flask应用。

        Args:
            mod_info: mod.json 解析后的字典（含 _dir 字段）
            app: Flask 应用实例

        Returns:
            是否加载成功
        """
        mod_id = mod_info.get('id', 'unknown')
        if mod_id in self.loaded:
            logger.warning(f"Mod已加载，跳过: {mod_id}")
            return True

        backend_cfg = mod_info.get('backend', {})
        if not backend_cfg.get('enabled', False):
            logger.info(f"Mod后端未启用，跳过: {mod_id}")
            return False

        logger.info(f"加载Mod: {mod_id} v{mod_info.get('version','?')} — {mod_info.get('name', mod_id)}")

        try:
            # 将 Mod 目录加入 sys.path
            mod_dir = mod_info['_dir']
            if mod_dir not in sys.path:
                sys.path.insert(0, mod_dir)

            # 加载路由
            router_path = backend_cfg.get('router', '')
            if router_path:
                self._load_router(mod_info, router_path, app)

            # 调用 on_load 回调
            on_load = backend_cfg.get('on_load')
            if on_load:
                self._invoke_callback(mod_info, on_load)

            self.loaded[mod_id] = mod_info
            logger.info(f"Mod加载成功: {mod_id}")
            return True

        except Exception as e:
            logger.error(f"Mod加载失败 [{mod_id}]: {e}", exc_info=True)
            return False

    # ━━━━ 卸载 ━━━━

    def unload_mod(self, mod_id: str) -> bool:
        """卸载Mod（调用on_unload回调）"""
        if mod_id not in self.loaded:
            return False

        mod_info = self.loaded[mod_id]
        on_unload = mod_info.get('backend', {}).get('on_unload')
        if on_unload:
            try:
                self._invoke_callback(mod_info, on_unload)
            except Exception as e:
                logger.warning(f"Mod {mod_id} on_unload出错: {e}")

        self.loaded.pop(mod_id, None)
        logger.info(f"Mod已卸载: {mod_id}")
        return True

    # ━━━━ 查询 ━━━━

    def get_loaded_mods(self) -> list[dict]:
        """返回所有已加载Mod的摘要信息"""
        result = []
        for mod_id, info in self.loaded.items():
            result.append({
                'id': mod_id,
                'name': info.get('name', mod_id),
                'version': info.get('version', '?'),
                'description': info.get('description', ''),
                'author': info.get('author', ''),
                'backend_enabled': info.get('backend', {}).get('enabled', False),
                'frontend_enabled': info.get('frontend', {}).get('enabled', False),
            })
        return result

    # ━━━━ 内部方法 ━━━━

    def _load_router(self, mod_info: dict, router_path: str, app) -> None:
        """加载Mod路由模块并调用注册函数。

        router_path 格式: "backend.router:register"
          → 导入 {mod_dir}/backend/router.py，调用 register(app, mod_id, mod_info)
        """
        if ':' not in router_path:
            raise ValueError(f"路由路径格式错误: {router_path}")

        module_path, func_name = router_path.split(':', 1)
        module = self._import_module(mod_info, module_path)
        if module is None:
            return

        register_func = getattr(module, func_name, None)
        if register_func is None:
            logger.error(f"模块 {module_path} 中找不到函数 {func_name}")
            return

        register_func(app, mod_info['id'], mod_info)
        logger.info(f"  路由已注册: /api/mod/{mod_info['id']}")

    def _import_module(self, mod_info: dict, module_path: str) -> Any:
        """动态导入Python模块。"""
        mod_dir = Path(mod_info['_dir'])
        full_name = f"mod_{mod_info['id']}_{module_path.replace('.', '_').replace('/', '_')}"

        # 查找模块文件
        module_file = mod_dir / (module_path.replace('.', '/') + '.py')
        if not module_file.exists():
            init_file = mod_dir / module_path.replace('.', '/') / '__init__.py'
            if init_file.exists():
                module_file = init_file
            else:
                logger.error(f"模块文件不存在: {module_file}")
                return None

        try:
            spec = importlib.util.spec_from_file_location(full_name, str(module_file))
            if spec is None or spec.loader is None:
                logger.error(f"无法加载模块: {module_path}")
                return None

            module = importlib.util.module_from_spec(spec)
            sys.modules[full_name] = module
            spec.loader.exec_module(module)
            self._modules[f"{mod_info['id']}:{module_path}"] = module
            return module
        except Exception as e:
            logger.error(f"导入模块失败 [{module_path}]: {e}", exc_info=True)
            return None

    def _invoke_callback(self, mod_info: dict, callback_path: str) -> None:
        """调用Mod生命周期回调。"""
        if ':' not in callback_path:
            logger.error(f"回调路径格式错误: {callback_path}")
            return

        module_path, func_name = callback_path.split(':', 1)
        module = self._import_module(mod_info, module_path)
        if module is None:
            return

        func = getattr(module, func_name, None)
        if func is None:
            logger.warning(f"回调函数不存在: {callback_path}")
            return

        func()
        logger.info(f"  回调已执行: {callback_path}")
