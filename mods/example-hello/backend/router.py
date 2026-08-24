"""示例Mod — 注册自定义路由到Flask应用"""

from flask import jsonify


def register(app, mod_id, mod_info):
    """Mod路由注册函数。

    Args:
        app: Flask应用实例
        mod_id: Mod唯一标识
        mod_info: mod.json内容字典
    """

    @app.route(f'/api/mod/{mod_id}/hello')
    def mod_hello():
        return jsonify({
            'message': f'Hello from {mod_info["name"]}!',
            'mod': mod_id,
            'version': mod_info['version'],
        })

    @app.route(f'/api/mod/{mod_id}/info')
    def mod_info_route():
        return jsonify({
            'id': mod_id,
            'name': mod_info['name'],
            'version': mod_info['version'],
            'description': mod_info.get('description', ''),
            'author': mod_info.get('author', ''),
        })
