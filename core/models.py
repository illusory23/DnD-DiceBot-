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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)

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
            'created_at': self.created_at.isoformat() if self.created_at else '',
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
    level = db.Column(db.Integer, default=1)
    class_ = db.Column('class', db.String(50), default='')
    race = db.Column(db.String(50), default='')
    subrace = db.Column(db.String(50), default='')
    background_field = db.Column(db.String(100), default='')
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
