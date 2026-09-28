from sqlalchemy import CheckConstraint, MetaData
from sqlalchemy.orm import DeclarativeBase

# 마이그레이션에서 제약조건 이름이 매번 같도록 고정
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def check_in(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    """column 값이 values 중 하나인지 DB에서 강제한다."""
    allowed = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f'"{column}" IN ({allowed})', name=name)
