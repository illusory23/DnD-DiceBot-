# -*- coding: utf-8 -*-
"""五版不全书 CHM 目录树解析（DND五版不全书.hhc）

hhc = HTML Help Contents，GBK 编码，UL/LI/OBJECT 嵌套表示层级：
  <LI><OBJECT type="text/sitemap"><param name="Name" value="书名">
      <param name="Local" value="路径.htm"></OBJECT>
  - Name = 显示名；Local = 词条相对路径（无 Local 的节点 = 纯目录分组）
解析为带全局 id 的树，提供按父 id 取子节点的懒加载接口。
"""
import html as _html
import re
from pathlib import Path
from urllib.parse import unquote

CHM_DIR = Path(__file__).parent.parent / 'data' / 'chm_extracted'
HHC_FILE = CHM_DIR / 'DND五版不全书.hhc'

_UL_OBJ_RE = re.compile(r'<UL>|</UL>|<LI>\s*<OBJECT[^>]*>(.*?)</OBJECT>', re.S)
_NAME_RE = re.compile(r'<param\s+name="Name"\s+value="([^"]*)"', re.I)
_LOCAL_RE = re.compile(r'<param\s+name="Local"\s+value="([^"]*)"', re.I)

# 模块级缓存（服务生命周期内只解析一次；hhc 更新需重启）
_tree_root: list = []
_by_id: dict = {}
_loaded = False


def _load() -> None:
    """解析 hhc → 树（惰性，只跑一次）"""
    global _tree_root, _by_id, _loaded
    if _loaded:
        return
    _tree_root = []
    _by_id = {}
    if not HHC_FILE.exists():
        _loaded = True
        return

    text = HHC_FILE.read_text(encoding='gbk', errors='ignore')

    # 线性扫描：维护 UL 深度，提取 (深度, 名称, 路径)
    depth = 0
    flat: list[tuple[int, str, str]] = []
    for m in _UL_OBJ_RE.finditer(text):
        t = m.group(0)
        if t == '<UL>':
            depth += 1
        elif t == '</UL>':
            depth = max(0, depth - 1)
        else:
            obj = m.group(1)
            name = ''
            nm = _NAME_RE.search(obj)
            if nm:
                name = nm.group(1).strip()
            if not name:
                continue
            local = ''
            lm = _LOCAL_RE.search(obj)
            if lm:
                # hhc 中路径带 URL 编码（%20=空格）与 HTML 实体（&amp;=&），需解码
                local = _html.unescape(unquote(lm.group(1).strip())).replace('\\', '/')
            flat.append((depth, name, local))

    # 按深度建树（栈式）
    _next_id = [0]

    def make_node(name: str, local: str) -> dict:
        _next_id[0] += 1
        node = {'id': _next_id[0], 'name': name, 'local': local, 'children': []}
        _by_id[node['id']] = node
        return node

    stack: list[list] = [_tree_root]
    cur_depth = 0
    for d, name, local in flat:
        if d > cur_depth:
            # 进入子层（挂到上一层最后一个节点下）
            parent_children = stack[-1]
            if parent_children:
                stack.append(parent_children[-1]['children'])
            else:
                stack.append([])
            cur_depth = d
        elif d < cur_depth:
            # 退栈到目标深度（stack[0]=根，depth n 对应 stack[n]）
            while len(stack) > d:
                stack.pop()
            cur_depth = d
        node = make_node(name, local)
        stack[-1].append(node)
    _loaded = True


def get_children(parent_id: int) -> list[dict]:
    """返回父节点下的子节点列表（懒加载用）"""
    _load()
    parent = _by_id.get(parent_id)
    children = parent['children'] if parent else _tree_root
    return [{'id': c['id'], 'name': c['name'], 'local': c['local'],
             'has_children': bool(c['children'])} for c in children]


def node_count() -> int:
    """目录节点总数（统计用）"""
    _load()
    return len(_by_id)
