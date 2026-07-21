from __future__ import annotations

import json
import os
import time
import uuid

import mysql.connector
import redis

from solver import InfeasibleSchedule, solve_schedule


def binary_id(value: str) -> bytes:
    return uuid.UUID(value).bytes


def connection():
    return mysql.connector.connect(
        host=os.environ.get("MYSQL_HOST", "mysql"), port=int(os.environ.get("MYSQL_PORT", "3306")),
        database=os.environ["MYSQL_DATABASE"], user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
    )


def process(message: dict):
    job_id = message["jobId"]
    db = connection()
    cursor = db.cursor()
    try:
        cursor.execute("update solver_jobs set status='running', progress=15, attempts=attempts+1 where id=%s", (binary_id(job_id),))
        db.commit()
        snapshot = message.get("snapshot")
        if snapshot is None:
            cursor.execute("select snapshot_json from solver_snapshots where job_id=%s", (binary_id(job_id),))
            row = cursor.fetchone()
            if not row:
                raise ValueError("solver snapshot not found")
            snapshot = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        candidates = solve_schedule(snapshot, 3)
        cursor.execute("delete from schedule_candidates where job_id=%s", (binary_id(job_id),))
        for index, candidate in enumerate(candidates, start=1):
            cursor.execute(
                "insert into schedule_candidates (id, job_id, candidate_index, score, explanation_json, assignments_json) values (%s,%s,%s,%s,%s,%s)",
                (uuid.uuid4().bytes, binary_id(job_id), index, candidate.score, json.dumps(candidate.explanation), json.dumps(candidate.assignments)),
            )
        cursor.execute("update solver_jobs set status='completed', progress=100 where id=%s", (binary_id(job_id),))
        cursor.execute("update schedule_tasks set status='reviewing', version=version+1 where id=(select task_id from solver_jobs where id=%s) and status='solving'", (binary_id(job_id),))
        db.commit()
    except InfeasibleSchedule as error:
        db.rollback()
        cursor.execute("update solver_jobs set status='failed', progress=100, error_json=%s where id=%s", (json.dumps({"code": "INFEASIBLE", "message": str(error)}), binary_id(job_id)))
        cursor.execute("update schedule_tasks set status='failed', version=version+1 where id=(select task_id from solver_jobs where id=%s) and status='solving'", (binary_id(job_id),))
        db.commit()
    except Exception as error:
        db.rollback()
        cursor.execute("update solver_jobs set status='failed', progress=100, error_json=%s where id=%s", (json.dumps({"code": "WORKER_ERROR", "message": str(error)[:500]}), binary_id(job_id)))
        cursor.execute("update schedule_tasks set status='failed', version=version+1 where id=(select task_id from solver_jobs where id=%s) and status='solving'", (binary_id(job_id),))
        db.commit()
    finally:
        cursor.close()
        db.close()


def main():
    client = redis.Redis(host=os.environ.get("REDIS_HOST", "redis"), port=int(os.environ.get("REDIS_PORT", "6379")), decode_responses=True)
    db = connection()
    cursor = db.cursor()
    cursor.execute("select lower(concat(substr(hex(id),1,8),'-',substr(hex(id),9,4),'-',substr(hex(id),13,4),'-',substr(hex(id),17,4),'-',substr(hex(id),21))) from solver_jobs where status='running' and updated_at < date_sub(current_timestamp(3), interval 60 second)")
    stale_jobs = [row[0] for row in cursor.fetchall()]
    cursor.close()
    db.close()
    for job_id in stale_jobs:
        process({"jobId": job_id})
    while True:
        _, raw = client.brpop("scheduling:solver:jobs", timeout=5) or (None, None)
        if raw:
            try:
                process(json.loads(raw))
            except Exception as error:  # worker keeps consuming after one bad job
                print(json.dumps({"worker_error": str(error)}), flush=True)
        else:
            time.sleep(0.1)


if __name__ == "__main__":
    main()
