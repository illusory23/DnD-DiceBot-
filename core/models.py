"""尘封之卷 — SQLAlchemy ORM 模型定义

17 张表：用户系统(1) + D&D 5E 角色卡(16)。
从 raw sqlite3 迁移到 SQLAlchemy，保持表结构兼容。
"""

from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from core.database import db


# ═══════════════════════════════════════════════════════════════════
# 0. 用户系统
# ═══════════════════════════════════════════════════════════════════

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    phone = db.Column(db.String(20), default='')
    bio = db.Column(db.Text, default='')
    avatar_url = db.Column(db.Text, default='')
    is_admin = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    last_login_ip = db.Column(db.String(64), default='')

    # 关系
    characters = db.relationship('Character', back_populates='owner', lazy='dynamic')

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        from core.models import Character
        # 统计角色数：关联 user_id + 旧数据 created_by 匹配
        linked = self.characters.count()
        legacy = 0
        if self.username:
            legacy = Character.query.filter(
                Character.user_id.is_(None),
                Character.created_by == self.username,
            ).count()
        return {
            'id': self.id, 'username': self.username, 'email': self.email,
            'phone': self.phone, 'bio': self.bio, 'avatar_url': self.avatar_url,
            'is_admin': self.is_admin,
            'is_active': self.is_active if self.is_active is not None else True,
            'created_at': self.created_at.isoformat() if self.created_at else '',
            'last_login': self.last_login.isoformat() if self.last_login else '',
            'last_login_ip': self.last_login_ip or '',
            'character_count': linked + legacy,
        }


# ═══════════════════════════════════════════════════════════════════
# 1-16. D&D 角色卡
# ═══════════════════════════════════════════════════════════════════


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. 角色分组
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class CharacterGroup(db.Model):
    __tablename__ = 'character_groups'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False, default='新分组')
    sort_order = db.Column(db.Integer, default=0)
    created_by = db.Column(db.String(100), default='')

    characters = db.relationship('Character', back_populates='group', lazy='dynamic')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. 角色基础信息
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class Character(db.Model):
    __tablename__ = 'characters'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    player = db.Column(db.String(100), default='')
    created_by = db.Column(db.String(100), default='')
    is_public = db.Column(db.Boolean, default=False)  # DM 公开角色：所有玩家可见
    level = db.Column(db.Integer, default=1)
    class_ = db.Column('class', db.String(50), default='')
    race = db.Column(db.String(50), default='')
    subrace = db.Column(db.String(50), default='')
    background_field = db.Column(db.Text, default='')  # 实际存背景 JSON 全文, 需 Text
    alignment = db.Column(db.String(50), default='')
    faith = db.Column(db.String(100), default='')
    gender = db.Column(db.String(20), default='')
    age = db.Column(db.String(20), default='')
    height = db.Column(db.String(20), default='')
    weight_field = db.Column(db.String(20), default='')
    hp_max = db.Column(db.Integer, default=10)
    hp_current = db.Column(db.Integer, default=10)
    temp_hp = db.Column(db.Integer, default=0)
    ac = db.Column(db.Integer, default=10)
    initiative_bonus = db.Column(db.Integer, default=0)
    speed = db.Column(db.Integer, default=30)
    proficiency_bonus = db.Column(db.Integer, default=2)
    hit_dice = db.Column(db.String(10), default='1d8')
    hd_count = db.Column(db.Integer, default=1)
    xp = db.Column(db.Integer, default=0)
    passive_perception = db.Column(db.Integer, default=10)
    spellcasting_ability = db.Column(db.String(20), default='')
    spell_attack_bonus = db.Column(db.Integer, default=0)
    spell_save_dc = db.Column(db.Integer, default=10)
    prepared_spell_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    portrait_path = db.Column(db.Text, default='')
    source_file = db.Column(db.Text, default='')
    resistances = db.Column(db.Text, default='')
    key_abilities = db.Column(db.Text, default='')
    sort_order = db.Column(db.Integer, default=0)
    group_id = db.Column(db.Integer, db.ForeignKey('character_groups.id', ondelete='SET NULL'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'))

    # 关系（级联删除：删角色时自动清理所有关联数据）
    owner = db.relationship('User', back_populates='characters')
    group = db.relationship('CharacterGroup', back_populates='characters')
    abilities = db.relationship('Ability', back_populates='character',
                                cascade='all, delete-orphan', uselist=False)
    skill_proficiencies = db.relationship('SkillProficiency', back_populates='character',
                                          cascade='all, delete-orphan')
    save_proficiencies = db.relationship('SaveProficiency', back_populates='character',
                                         cascade='all, delete-orphan')
    spell_slots = db.relationship('SpellSlot', back_populates='character',
                                  cascade='all, delete-orphan')
    death_saves = db.relationship('DeathSave', back_populates='character',
                                  cascade='all, delete-orphan', uselist=False)
    weapons = db.relationship('Weapon', back_populates='character',
                              cascade='all, delete-orphan')
    armor = db.relationship('Armor', back_populates='character',
                            cascade='all, delete-orphan', uselist=False)
    coins = db.relationship('Coins', back_populates='character',
                            cascade='all, delete-orphan', uselist=False)
    prepared_spells = db.relationship('PreparedSpell', back_populates='character',
                                      cascade='all, delete-orphan')
    learned_spells = db.relationship('LearnedSpell', back_populates='character',
                                     cascade='all, delete-orphan')
    background_details = db.relationship('BackgroundDetail', back_populates='character',
                                         cascade='all, delete-orphan', uselist=False)
    inventory = db.relationship('InventoryItem', back_populates='character',
                                cascade='all, delete-orphan')
    features = db.relationship('CharacterFeature', back_populates='character',
                               cascade='all, delete-orphan')


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3-16. 关联表
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class Ability(db.Model):
    __tablename__ = 'abilities'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), unique=True)
    str = db.Column(db.Integer, default=10)
    dex = db.Column(db.Integer, default=10)
    con = db.Column(db.Integer, default=10)
    int_score = db.Column('int_score', db.Integer, default=10)
    wis = db.Column(db.Integer, default=10)
    cha = db.Column(db.Integer, default=10)

    character = db.relationship('Character', back_populates='abilities')


class SkillProficiency(db.Model):
    __tablename__ = 'skill_proficiencies'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    skill_name = db.Column(db.String(50))
    is_proficient = db.Column(db.Boolean, default=False)
    is_expertise = db.Column(db.Boolean, default=False)
    bonus = db.Column(db.Integer, default=0)

    character = db.relationship('Character', back_populates='skill_proficiencies')


class SaveProficiency(db.Model):
    __tablename__ = 'save_proficiencies'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    ability_name = db.Column(db.String(20))
    is_proficient = db.Column(db.Boolean, default=False)
    save_bonus = db.Column(db.Integer, default=0)

    character = db.relationship('Character', back_populates='save_proficiencies')


class SpellSlot(db.Model):
    __tablename__ = 'spell_slots'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    slot_level = db.Column(db.String(10))
    max_slots = db.Column(db.Integer, default=0)
    used_slots = db.Column(db.Integer, default=0)

    character = db.relationship('Character', back_populates='spell_slots')


class DeathSave(db.Model):
    __tablename__ = 'death_saves'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), unique=True)
    successes = db.Column(db.Integer, default=0)
    failures = db.Column(db.Integer, default=0)
    is_stable = db.Column(db.Boolean, default=False)

    character = db.relationship('Character', back_populates='death_saves')


class Weapon(db.Model):
    __tablename__ = 'weapons'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    name = db.Column(db.String(100), default='')
    attack_bonus = db.Column(db.Integer, default=0)
    damage_dice = db.Column(db.String(50), default='')
    damage_type = db.Column(db.String(50), default='')
    is_proficient = db.Column(db.Boolean, default=False)
    ammo = db.Column(db.String(50), default='')
    notes = db.Column(db.Text, default='')
    description = db.Column(db.Text, default='')
    effect = db.Column(db.Text, default='')

    character = db.relationship('Character', back_populates='weapons')


class Armor(db.Model):
    __tablename__ = 'armor'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), unique=True)
    armor_name = db.Column(db.String(100), default='')
    armor_ac = db.Column(db.Integer, default=0)
    armor_max_dex = db.Column(db.String(20), default='')
    shield_name = db.Column(db.String(100), default='')
    shield_ac = db.Column(db.Integer, default=0)
    shield_weight = db.Column(db.String(20), default='')

    character = db.relationship('Character', back_populates='armor')


class Coins(db.Model):
    __tablename__ = 'coins'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), unique=True)
    cp = db.Column(db.Integer, default=0)
    sp = db.Column(db.Integer, default=0)
    ep = db.Column(db.Integer, default=0)
    gp = db.Column(db.Integer, default=0)
    pp = db.Column(db.Integer, default=0)

    character = db.relationship('Character', back_populates='coins')


class PreparedSpell(db.Model):
    __tablename__ = 'prepared_spells'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    spell_name = db.Column(db.String(100), nullable=False)
    spell_level = db.Column(db.Integer, default=0)
    is_prepared = db.Column(db.Boolean, default=True)
    notes = db.Column(db.Text, default='')

    character = db.relationship('Character', back_populates='prepared_spells')


class LearnedSpell(db.Model):
    __tablename__ = 'learned_spells'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    spell_name = db.Column(db.String(100), nullable=False)
    spell_level = db.Column(db.Integer, default=0)
    school = db.Column(db.String(50), default='')
    casting_time = db.Column(db.String(50), default='')
    range = db.Column(db.String(50), default='')
    duration = db.Column(db.String(50), default='')
    components = db.Column(db.String(50), default='')
    ritual = db.Column(db.String(10), default='否')
    concentration = db.Column(db.String(10), default='否')
    description = db.Column(db.Text, default='')
    source = db.Column(db.String(50), default='自定义')

    character = db.relationship('Character', back_populates='learned_spells')


class BackgroundDetail(db.Model):
    __tablename__ = 'background_details'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'), unique=True)
    personality_traits = db.Column(db.Text, default='')
    personality_traits_ext = db.Column(db.Text, default='')
    ideals = db.Column(db.Text, default='')
    bonds = db.Column(db.Text, default='')
    flaws = db.Column(db.Text, default='')
    background_feature = db.Column(db.Text, default='')
    appearance = db.Column(db.Text, default='')
    backstory = db.Column(db.Text, default='')
    origin = db.Column(db.Text, default='')
    languages = db.Column(db.Text, default='')
    tool_proficiencies = db.Column(db.Text, default='')

    character = db.relationship('Character', back_populates='background_details')


class InventoryItem(db.Model):
    __tablename__ = 'inventory'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    item_name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, default=1)
    weight = db.Column(db.Float, default=0)
    value = db.Column(db.String(50), default='')
    location = db.Column(db.String(50), default='背包')
    notes = db.Column(db.Text, default='')
    description = db.Column(db.Text, default='')
    effect = db.Column(db.Text, default='')

    character = db.relationship('Character', back_populates='inventory')


class CharacterFeature(db.Model):
    __tablename__ = 'character_features'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    character_id = db.Column(db.Integer, db.ForeignKey('characters.id', ondelete='CASCADE'))
    category = db.Column(db.String(50), nullable=False, default='other')
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, default='')
    sort_order = db.Column(db.Integer, default=0)

    character = db.relationship('Character', back_populates='features')


# ═══════════════════════════════════════════════════════════════════
# 17. 北境雪原存档
# ═══════════════════════════════════════════════════════════════════

class NorthSave(db.Model):
    __tablename__ = 'north_saves'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), index=True)
    save_name = db.Column(db.String(100), default='auto')
    save_data = db.Column(db.Text)  # JSON 格式的完整存档数据
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('north_saves', lazy='dynamic'))


# ═══════════════════════════════════════════════════════════════════
# 18-31. 运行数据表（2026-08-15 PostgreSQL 全量迁移新增）
# 原 JSON 文件存储 → PG 表；核心列 + data JSON 列兜底（保留原始 dict）
# ═══════════════════════════════════════════════════════════════════


class ChatMessage(db.Model):
    """聊天室消息（原 web/chat_log.json + web/tavern_chat_log.json）。

    channel: 'chat' | 'tavern'；data 保留完整原始 dict；
    常用字段提列便于召回/裁剪/撤回标记。
    """
    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    channel = db.Column(db.String(20), nullable=False, default='chat', index=True)
    name = db.Column(db.String(100), default='')
    text = db.Column(db.Text, default='')
    time = db.Column(db.String(20), default='')
    is_dm = db.Column(db.Boolean, default=False)
    color = db.Column(db.String(20), default='')
    role = db.Column(db.String(20), default='')
    ip = db.Column(db.String(64), default='')
    ts = db.Column(db.Float, default=0)          # _ts 时间戳
    event_id = db.Column(db.Integer, index=True)  # 事件消息关联
    recalled = db.Column(db.Boolean, default=False)  # _recalled 撤回标记
    data = db.Column(db.JSON)  # 完整原始 dict


class ChatArchive(db.Model):
    """聊天归档（原 web/chat_archive/*.json、tavern_chat_archive/*.json）。"""
    __tablename__ = 'chat_archives'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    channel = db.Column(db.String(20), nullable=False, default='chat', index=True)
    filename = db.Column(db.String(200), default='')
    messages = db.Column(db.JSON)  # 消息 dict 数组
    created_at = db.Column(db.String(20), default='')  # YYYY-MM-DD HH:MM:SS


class DmEvent(db.Model):
    """DM 保存的事件（原 web/dm_event_list.json）。"""
    __tablename__ = 'dm_events'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(100), default='')
    content = db.Column(db.Text, default='')
    created_at = db.Column(db.String(20), default='')


class PublishedDmEvent(db.Model):
    """DM 已发布事件历史（原 web/dm_published_events.json）。"""
    __tablename__ = 'dm_published_events'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(100), default='')
    content = db.Column(db.Text, default='')
    published_at = db.Column(db.String(20), default='')
    recalled_at = db.Column(db.String(20))  # None=未撤回
    pinned = db.Column(db.Boolean, default=False)


class EventStat(db.Model):
    """事件统计（原 web/event_stats.json）：{用户名: {表名: {...}, '_clicks': n}}"""
    __tablename__ = 'event_stats'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(100), nullable=False, index=True)
    data = db.Column(db.JSON)  # 该用户的事件统计 dict


class DiceStat(db.Model):
    """骰子统计（原 web/dice_stats.json）：{用户名: {total, crit20, crit1}}"""
    __tablename__ = 'dice_stats'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(100), nullable=False, index=True)
    total = db.Column(db.Integer, default=0)
    crit20 = db.Column(db.Integer, default=0)
    crit1 = db.Column(db.Integer, default=0)


class CombatState(db.Model):
    """战斗状态（原 web/combat_state.json），单行 id=1。"""
    __tablename__ = 'combat_state'

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.JSON)  # {combatants, round, ...}
    ts = db.Column(db.Float, default=0)


class SharedCanvas(db.Model):
    """共享画布（原 web/shared_canvas.json），单行 id=1。"""
    __tablename__ = 'shared_canvas'

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.JSON)  # {strokes, layers, tokens, texts, fog, ...}
    ver = db.Column(db.Integer, default=0)   # _ver 版本号
    ts = db.Column(db.Float, default=0)      # _ts 时间戳


class Topic(db.Model):
    """每周话题（原 data/topics.json）。content 为 HTML。"""
    __tablename__ = 'topics'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(100), nullable=False, default='')
    content = db.Column(db.Text, default='')
    images = db.Column(db.JSON)  # 图片 URL 数组
    author = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')
    updated_at = db.Column(db.String(20), default='')
    comments = db.Column(db.JSON)  # [{id, username, content, created_at}]


class Announcement(db.Model):
    """平台公告（原 data/announcements.json）。"""
    __tablename__ = 'announcements'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(100), nullable=False, default='')
    content = db.Column(db.Text, default='')
    created_at = db.Column(db.String(20), default='')
    active = db.Column(db.Boolean, default=True)


class CommunityPost(db.Model):
    """酒馆帖子（原 data/community.json）。comments/likes 为 JSON 数组。"""
    __tablename__ = 'community_posts'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    board = db.Column(db.String(30), nullable=False, default='discuss', index=True)
    title = db.Column(db.String(200), default='')
    content = db.Column(db.Text, default='')
    images = db.Column(db.JSON)
    author = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')
    reply_count = db.Column(db.Integer, default=0)
    comments = db.Column(db.JSON)  # [{id, username, content, created_at}]
    likes = db.Column(db.JSON)     # [username, ...]


class WorkshopItem(db.Model):
    """工坊投稿（原 data/workshop.json）。"""
    __tablename__ = 'workshop_items'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    title = db.Column(db.String(200), default='')
    desc = db.Column(db.Text, default='')
    file_url = db.Column(db.Text, default='')
    author = db.Column(db.String(100), default='')
    created_at = db.Column(db.String(20), default='')
    cat = db.Column(db.String(30), default='user')
    comments = db.Column(db.JSON)
    likes = db.Column(db.JSON)


class Favorite(db.Model):
    """用户收藏（原 data/favorites.json）。"""
    __tablename__ = 'favorites'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, index=True)
    type = db.Column(db.String(20), nullable=False, default='post')  # post | workshop
    item_id = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.String(20), default='')


class Notification(db.Model):
    """消息通知（2026-08-16 新增）：被评论/被点赞/被@提醒。

    type: post_comment | workshop_comment | post_like | workshop_like | mention
          | friend_request | friend_accept
    link: 跳转详情页（/post/<id>、/workshop/<id>）
    content: 动作文本（不含 actor，展示时 count>1 用 "N 人"+content，否则 actor+content）
    group_key: 聚合去重键（如 post_comment:3），同 key 未读通知累加 count
    """
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)  # 接收者
    type = db.Column(db.String(30), nullable=False, default='post_comment')
    actor = db.Column(db.String(100), default='')   # 操作者用户名（最近一次）
    content = db.Column(db.Text, default='')        # 动作文本（不含 actor）
    link = db.Column(db.String(200), default='')    # 跳转链接
    read = db.Column(db.Boolean, default=False)
    group_key = db.Column(db.String(100), default='', index=True)  # 聚合去重键
    count = db.Column(db.Integer, default=1)        # 聚合人数
    created_at = db.Column(db.String(20), default='')


class FriendRequest(db.Model):
    """好友申请（2026-08-18 新增）：双向好友体系。

    user_id 发起方 / target_id 接收方（均存 id 不存用户名，防改名丢数据）
    status: pending | accepted | rejected；好友关系 = accepted 记录（不另建好友表）
    """
    __tablename__ = 'friend_requests'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)   # 请求方
    target_id = db.Column(db.Integer, nullable=False, index=True)  # 被请求方
    status = db.Column(db.String(10), nullable=False, default='pending')
    created_at = db.Column(db.String(20), default='')
    responded_at = db.Column(db.String(20), default='')
