# Task Polling Architecture - On-Demand Alarm System

## Overview

The system uses **on-demand Durable Object alarms** to poll AIGC tasks efficiently. Alarms are only active when there are pending tasks, eliminating unnecessary polling overhead.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Task Submission Flow                          │
└─────────────────────────────────────────────────────────────────┘

User/Agent
    │
    │ 1. POST /tasks
    ▼
┌─────────────────┐
│  Worker         │
│  (index.ts)     │
└────────┬────────┘
         │
         │ 2. Create task in D1
         ▼
┌─────────────────────┐
│  D1 Database        │
│  - task_id          │
│  - status: pending  │
│  - params           │
└─────────────────────┘
         │
         │ 3. Submit to executor
         ▼
┌─────────────────────┐
│  TaskExecutor       │
│  (Kling/Gemini)     │
└────────┬────────────┘
         │
         ├─ If sync (completed=true)
         │  └─> Broadcast result immediately ──> End
         │
         └─ If async (completed=false)
            │
            │ 4. Update task: status=processing, external_task_id=xxx
            ▼
        ┌─────────────────────┐
        │  D1 Database        │
        │  - external_task_id │
        │  - status:          │
        │    processing       │
        └─────────────────────┘
            │
            │ 5. Trigger polling alarm
            ▼
        ┌─────────────────────┐
        │  LoroRoom (DO)      │
        │  POST /trigger-     │
        │  task-polling       │
        └────────┬────────────┘
                 │
                 │ 6. Set alarm_type='task_polling'
                 │    Schedule alarm in 10 seconds
                 ▼


┌─────────────────────────────────────────────────────────────────┐
│                    Task Polling Loop                             │
└─────────────────────────────────────────────────────────────────┘

        ┌─────────────────────┐
        │  Alarm triggers     │
        │  (every 10 sec)     │
        └────────┬────────────┘
                 │
                 │ 1. Check alarm_type
                 ▼
        ┌─────────────────────┐
        │  alarm_type =       │
        │  'task_polling'?    │
        └────────┬────────────┘
                 │
                 │ Yes
                 ▼
        ┌─────────────────────┐
        │  Query D1 for       │
        │  pending tasks      │
        │  in this project    │
        └────────┬────────────┘
                 │
                 ├─ No pending tasks
                 │  │
                 │  └─> Switch to 'snapshot' mode ──> End polling
                 │
                 └─ Has pending tasks
                    │
                    │ 2. For each task
                    ▼
                ┌─────────────────────┐
                │  executor.poll(     │
                │    external_task_id │
                │  )                  │
                └────────┬────────────┘
                         │
                         ├─ completed=false
                         │  │
                         │  └─> Increment retry, schedule next poll (10s)
                         │
                         └─ completed=true
                            │
                            ├─ Has error
                            │  └─> Update task: status=failed
                            │
                            └─ Success
                               │
                               │ 3. Update D1: status=completed
                               ▼
                           ┌─────────────────────┐
                           │  Broadcast to Loro  │
                           │  (update doc)       │
                           └────────┬────────────┘
                                    │
                                    │ 4. Send to WebSocket clients
                                    ▼
                           ┌─────────────────────┐
                           │  Frontend Clients   │
                           │  - Receive update   │
                           │  - Update UI        │
                           └─────────────────────┘
                                    │
                                    │ 5. Check if more tasks pending
                                    ▼
                           ┌─────────────────────┐
                           │  Still pending?     │
                           └────────┬────────────┘
                                    │
                                    ├─ Yes: Schedule next poll (10s)
                                    │
                                    └─ No: Switch to 'snapshot' mode
```

## Alarm State Machine

```
┌──────────────────────────────────────────────────────────────┐
│                  Alarm State Transitions                      │
└──────────────────────────────────────────────────────────────┘

Initial State: snapshot
  │
  │ WebSocket connects
  └─> Schedule alarm (5 min)
      ┌────────────────────┐
      │  alarm_type:       │
      │  'snapshot'        │
      │  interval: 5 min   │
      └────────┬───────────┘
               │
               │ Task submitted (async)
               │ POST /trigger-task-polling
               ▼
      ┌────────────────────┐
      │  alarm_type:       │
      │  'task_polling'    │
      │  interval: 10 sec  │
      └────────┬───────────┘
               │
               │ Poll tasks
               ▼
      ┌────────────────────┐
      │  Has pending       │
      │  tasks?            │
      └────────┬───────────┘
               │
               ├─ Yes
               │  └─> Continue 'task_polling' (10 sec)
               │
               └─ No
                  └─> Switch back to 'snapshot' (5 min)
```

## Key Benefits

### 1. **On-Demand Polling**
- Alarms only active when tasks exist
- No wasted polling cycles
- Automatic shutdown when tasks complete

### 2. **Per-Project Isolation**
- Each project's LoroRoom polls independently
- No global cron overhead
- Scales with active projects

### 3. **Fast Response (10 seconds)**
- Much faster than 1-minute cron minimum
- Quick feedback for users
- Efficient resource usage

### 4. **Automatic State Management**
```typescript
// State transitions are automatic:
submitTask() → triggerTaskPolling() → alarm starts polling
↓
pollPendingTasks() → returns false → alarm stops polling
```

### 5. **Resilient**
- If alarm fails, reschedules automatically
- Tasks tracked in D1 (persistent)
- Retry mechanism for failed polls

## Implementation Details

### LoroRoom Internal Endpoints

```typescript
// Trigger polling when new task submitted
POST /trigger-task-polling
→ Sets alarm_type='task_polling'
→ Schedules alarm in 10 seconds

// Broadcast task completion (from webhook or polling)
POST /broadcast-task
→ Updates Loro document
→ Broadcasts to all WebSocket clients
```

### Alarm Handler Logic

```typescript
async alarm() {
  const alarmType = await storage.get('alarm_type') || 'snapshot';

  if (alarmType === 'snapshot') {
    // Save document snapshot
    await saveDocumentSnapshot();
    // Reschedule in 5 minutes
    await setAlarm(Date.now() + 5 * 60 * 1000);
  }
  else if (alarmType === 'task_polling') {
    // Poll pending tasks
    const hasPending = await pollPendingTasks();

    if (hasPending) {
      // More tasks to poll - continue
      await setAlarm(Date.now() + 10 * 1000);
    } else {
      // No more tasks - switch back to snapshot mode
      await storage.put('alarm_type', 'snapshot');
      await setAlarm(Date.now() + 5 * 60 * 1000);
    }
  }
}
```

### Task Submission Flow

```typescript
// In Worker (index.ts)
const result = await executor.submit(params);

if (result.completed) {
  // Sync task - broadcast immediately
  await broadcastTaskCompletion(...);
} else {
  // Async task - trigger polling
  await updateTaskStatus(db, taskId, 'processing', {
    external_task_id: result.external_task_id
  });

  // Trigger polling alarm
  const stub = env.LORO_ROOM.get(id);
  await stub.fetch('http://internal/trigger-task-polling');
}
```

## Comparison: Before vs After

### Before (Cron-based)

```
❌ Global cron runs every 1 minute (minimum)
❌ Polls ALL projects even if no tasks
❌ Can't poll faster than 1 minute
❌ Wasted CPU cycles
```

### After (On-demand Alarm)

```
✅ Per-project alarms only when needed
✅ Polls only projects with pending tasks
✅ 10-second polling interval
✅ Automatic start/stop
✅ Zero overhead when idle
```

## Resource Efficiency

```
Before:
- 1 global cron × 60 times/hour × all projects = high overhead

After:
- N active alarms × 6 times/minute × only active projects = minimal overhead
- Alarms stop automatically when no tasks
- No polling when project has no pending tasks
```

## Edge Cases Handled

1. **No WebSocket Connection**: Alarm not started, tasks sit in D1
2. **Task Submitted Without Connection**: Alarm started when first client connects
3. **Alarm Fails**: Automatic rescheduling with error recovery
4. **All Tasks Complete**: Automatic switch back to snapshot-only mode
5. **Multiple Tasks**: Polls all pending tasks in single alarm cycle
6. **Task Stuck**: Retry mechanism with max_retries limit
