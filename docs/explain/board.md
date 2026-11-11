# EXPLAIN on seeded data (10,000 users, 2,000 teams)

Captured with `EXPLAIN (ANALYZE, BUFFERS)` on the local dev PostgreSQL 16.

## board_teams_first_page

```
Limit  (cost=0.28..9.54 rows=21 width=56) (actual time=3.395..4.053 rows=21 loops=1)
  Buffers: shared hit=513
  ->  Index Only Scan using teams_board on teams  (cost=0.28..283.78 rows=643 width=56) (actual time=3.394..4.050 rows=21 loops=1)
        Index Cond: (hackathon_id = '143b1c60-a523-42d3-90cf-d95b2f4c2874'::uuid)
        Heap Fetches: 21
        Buffers: shared hit=513
Planning:
  Buffers: shared hit=292
Planning Time: 2.212 ms
Execution Time: 4.101 ms
```

## board_people_first_page

```
Limit  (cost=0.85..25.63 rows=21 width=100) (actual time=0.091..0.215 rows=21 loops=1)
  Buffers: shared hit=144
  ->  Nested Loop  (cost=0.85..7089.52 rows=6008 width=100) (actual time=0.091..0.213 rows=21 loops=1)
        Buffers: shared hit=144
        ->  Nested Loop Anti Join  (cost=0.57..4395.10 rows=6008 width=24) (actual time=0.083..0.160 rows=21 loops=1)
              Buffers: shared hit=81
              ->  Index Only Scan using participants_board on participants p  (cost=0.29..975.10 rows=10000 width=40) (actual time=0.042..0.046 rows=33 loops=1)
                    Index Cond: (hackathon_id = '143b1c60-a523-42d3-90cf-d95b2f4c2874'::uuid)
                    Heap Fetches: 33
                    Buffers: shared hit=3
              ->  Index Only Scan using memberships_one_team_per_hackathon on memberships m  (cost=0.28..0.33 rows=1 width=32) (actual time=0.003..0.003 rows=0 loops=33)
                    Index Cond: ((hackathon_id = '143b1c60-a523-42d3-90cf-d95b2f4c2874'::uuid) AND (user_id = p.user_id))
                    Heap Fetches: 12
                    Buffers: shared hit=78
        ->  Index Scan using users_pkey on users u  (cost=0.29..0.45 rows=1 width=92) (actual time=0.002..0.002 rows=1 loops=21)
              Index Cond: (id = p.user_id)
              Buffers: shared hit=63
Planning:
  Buffers: shared hit=81
Planning Time: 1.263 ms
Execution Time: 0.232 ms
```
