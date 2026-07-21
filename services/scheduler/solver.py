from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class Candidate:
    assignments: dict[str, list[str]]
    score: int
    explanation: dict[str, Any]


class InfeasibleSchedule(ValueError):
    pass


def solve_schedule(payload: dict[str, Any], candidate_count: int = 3) -> list[Candidate]:
    members = [member["id"] for member in payload["members"]]
    slots = payload["slots"]
    availability = payload.get("availability", {})
    max_shifts = payload.get("maxShiftsPerMember", len(slots))
    fixed = {(item["slotId"], item["memberId"]) for item in payload.get("fixedAssignments", [])}
    results: list[Candidate] = []
    excluded: list[set[tuple[str, str]]] = []

    for index in range(candidate_count):
        model = cp_model.CpModel()
        assigned = {(slot["id"], member): model.new_bool_var(f"x_{slot['id']}_{member}") for slot in slots for member in members}
        for slot in slots:
            variables = [assigned[(slot["id"], member)] for member in members]
            model.add(sum(variables) >= slot.get("minPeople", 1))
            model.add(sum(variables) <= slot.get("maxPeople", slot.get("minPeople", 1)))
            for member in members:
                state = availability.get(member, {}).get(slot["id"], "unavailable")
                if state == "unavailable":
                    model.add(assigned[(slot["id"], member)] == 0)
        for slot_id, member_id in fixed:
            if (slot_id, member_id) not in assigned:
                raise InfeasibleSchedule("fixed assignment references an unknown slot or member")
            model.add(assigned[(slot_id, member_id)] == 1)
        loads = {}
        for member in members:
            loads[member] = model.new_int_var(0, max_shifts, f"load_{member}")
            model.add(loads[member] == sum(assigned[(slot["id"], member)] for slot in slots))
            model.add(loads[member] <= max_shifts)
        for previous in excluded:
            model.add(sum(assigned[pair] for pair in previous) <= len(previous) - 1)

        max_load = model.new_int_var(0, max_shifts, "max_load")
        min_load = model.new_int_var(0, max_shifts, "min_load")
        model.add_max_equality(max_load, list(loads.values()))
        model.add_min_equality(min_load, list(loads.values()))
        preference_penalties = []
        for slot in slots:
            for member in members:
                state = availability.get(member, {}).get(slot["id"], "unavailable")
                if state == "available":
                    preference_penalties.append(assigned[(slot["id"], member)])
        fairness_weight, preference_weight = [(20, 2), (8, 6), (12, 4)][min(index, 2)]
        model.minimize((max_load - min_load) * fairness_weight + sum(preference_penalties) * preference_weight)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 5
        solver.parameters.num_search_workers = 8
        solver.parameters.random_seed = 73 + index
        status = solver.solve(model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if not results:
                raise InfeasibleSchedule("no schedule satisfies coverage, availability and fixed assignments")
            break
        chosen = {(slot["id"], member) for slot in slots for member in members if solver.value(assigned[(slot["id"], member)])}
        excluded.append(chosen)
        by_slot = {slot["id"]: [member for member in members if (slot["id"], member) in chosen] for slot in slots}
        preferred = sum(availability.get(member, {}).get(slot_id) == "preferred" for slot_id, member in chosen)
        load_values = {member: solver.value(loads[member]) for member in members}
        results.append(Candidate(
            assignments=by_slot,
            score=round(solver.objective_value),
            explanation={
                "strategy": ["fairness-first", "preference-first", "balanced"][min(index, 2)],
                "preferredAssignments": preferred,
                "loadRange": [min(load_values.values()), max(load_values.values())],
                "memberLoads": load_values,
            },
        ))
    return results
