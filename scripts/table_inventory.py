"""Quick table inventory: sizes and primary keys for planning full mirror."""
import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;"
)
cur = conn.cursor()

# Get all tables with row counts, sorted by size
cur.execute("""
    SELECT t.TABLE_NAME,
           SUM(p.rows) AS row_count
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN sys.partitions p
      ON OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME) = p.object_id
      AND p.index_id IN (0, 1)
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    GROUP BY t.TABLE_NAME
    ORDER BY SUM(p.rows) DESC
""")
tables = [(r.TABLE_NAME, r.row_count) for r in cur.fetchall()]

# Categorize by size
huge = [(n, c) for n, c in tables if c > 100000]
large = [(n, c) for n, c in tables if 10000 < c <= 100000]
medium = [(n, c) for n, c in tables if 1000 < c <= 10000]
small = [(n, c) for n, c in tables if 0 < c <= 1000]
empty = [(n, c) for n, c in tables if c == 0]

total_rows = sum(c for _, c in tables)
print(f"Total tables: {len(tables)}")
print(f"Total rows:   {total_rows:,}")
print()

print(f"=== HUGE (>100K rows): {len(huge)} tables ===")
for n, c in huge:
    print(f"  {n:<50} {c:>12,}")

print(f"\n=== LARGE (10K-100K): {len(large)} tables ===")
for n, c in large:
    print(f"  {n:<50} {c:>12,}")

print(f"\n=== MEDIUM (1K-10K): {len(medium)} tables ===")
for n, c in medium:
    print(f"  {n:<50} {c:>12,}")

print(f"\n=== SMALL (1-1K): {len(small)} tables ===")
for n, c in small[:20]:
    print(f"  {n:<50} {c:>12,}")
if len(small) > 20:
    print(f"  ... and {len(small)-20} more")

print(f"\n=== EMPTY (0 rows): {len(empty)} tables ===")
for n, c in empty[:10]:
    print(f"  {n:<50} {c:>12,}")
if len(empty) > 10:
    print(f"  ... and {len(empty)-10} more")

conn.close()
