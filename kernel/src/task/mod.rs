#![allow(dead_code)]

#[cfg(target_arch = "riscv64")]
use core::arch::global_asm;

#[cfg(target_arch = "riscv64")]
global_asm!(include_str!("switch.S"));

/// Maximum number of kernel tasks in the first teaching scheduler.
pub const MAX_TASKS: usize = 4;
/// Size of each independent kernel task stack.
pub const TASK_STACK_SIZE: usize = 4096 * 4;
const STACK_ALIGN: usize = 16;

/// Entry function type for a kernel task.
pub type TaskEntry = extern "C" fn() -> !;

/// Stable identifier for one teaching task.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TaskId(usize);

impl TaskId {
    /// Create a task id from a fixed slot index.
    pub const fn new(value: usize) -> Self {
        Self(value)
    }

    /// Return the raw task id value.
    pub const fn value(self) -> usize {
        self.0
    }
}

/// State of a kernel task in the cooperative scheduler.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskStatus {
    /// The task can be selected by the scheduler.
    Ready,
    /// The task is currently running.
    Running,
    /// The task has returned through the planned task exit path.
    Exited,
}

/// Saved RISC-V callee-saved context for one task.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TaskContext {
    /// Return address restored by `__switch`.
    pub ra: usize,
    /// Stack pointer restored by `__switch`.
    pub sp: usize,
    /// Saved registers s0-s11.
    pub s: [usize; 12],
}

impl TaskContext {
    /// Return an empty context for an unstarted task slot.
    pub const fn zero() -> Self {
        Self {
            ra: 0,
            sp: 0,
            s: [0; 12],
        }
    }

    /// Build the initial context for a task entry and stack top.
    pub fn goto(_entry: TaskEntry, _stack_top: usize) -> Self {
        // TODO(LAB5-T1): set `ra` to the task entry and align `sp` to 16 bytes.
        Self::zero()
    }
}

/// Task control block used by the Lab5 scheduler skeleton.
#[derive(Clone, Copy)]
pub struct TaskControlBlock {
    id: TaskId,
    status: TaskStatus,
    context: TaskContext,
    entry: TaskEntry,
    stack_top: usize,
}

impl TaskControlBlock {
    /// Create a ready task control block for a fixed kernel stack.
    pub fn new(id: TaskId, entry: TaskEntry, stack_top: usize) -> Self {
        Self {
            id,
            status: TaskStatus::Ready,
            context: TaskContext::goto(entry, stack_top),
            entry,
            stack_top,
        }
    }

    /// Return this task's id.
    pub const fn id(&self) -> TaskId {
        self.id
    }

    /// Return this task's current status.
    pub const fn status(&self) -> TaskStatus {
        self.status
    }

    /// Return this task's saved context.
    pub const fn context(&self) -> &TaskContext {
        &self.context
    }

    /// Return the task stack top selected for this task.
    pub const fn stack_top(&self) -> usize {
        self.stack_top
    }
}

/// Errors returned by the Lab5 starter scheduler.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskError {
    /// The fixed task table is full.
    TaskTableFull,
    /// The requested task id does not fit the fixed task table.
    InvalidTaskId,
    /// The scheduler has no ready task to run.
    NoReadyTask,
    /// The starter intentionally leaves this operation for students.
    Unimplemented,
}

/// Fixed-capacity cooperative scheduler skeleton.
pub struct TaskManager {
    tasks: [Option<TaskControlBlock>; MAX_TASKS],
    current: Option<TaskId>,
    next_scan: usize,
}

impl TaskManager {
    /// Create an empty task manager.
    pub const fn new() -> Self {
        Self {
            tasks: [None; MAX_TASKS],
            current: None,
            next_scan: 0,
        }
    }

    /// Return the number of occupied task slots.
    pub fn task_count(&self) -> usize {
        let mut count = 0;
        let mut index = 0;
        while index < MAX_TASKS {
            if self.tasks[index].is_some() {
                count += 1;
            }
            index += 1;
        }
        count
    }

    /// Add a task into the fixed task table.
    pub fn add_task(&mut self, _task: TaskControlBlock) -> Result<(), TaskError> {
        // TODO(LAB5-T1): reject duplicate ids and insert the task into a free slot.
        Err(TaskError::Unimplemented)
    }

    /// Fetch the next ready task id using round-robin order.
    pub fn fetch_next(&mut self) -> Result<TaskId, TaskError> {
        // TODO(LAB5-T2): scan from `next_scan` and return the next Ready task.
        Err(TaskError::Unimplemented)
    }

    /// Run the next ready task.
    pub fn run_next(&mut self) -> Result<(), TaskError> {
        // TODO(LAB5-T2): update task states and call `schedule`.
        Err(TaskError::Unimplemented)
    }
}

impl Default for TaskManager {
    fn default() -> Self {
        Self::new()
    }
}

/// One statically allocated kernel stack.
#[repr(align(16))]
#[derive(Clone, Copy)]
pub struct KernelStack {
    bytes: [u8; TASK_STACK_SIZE],
}

impl KernelStack {
    const fn new() -> Self {
        Self {
            bytes: [0; TASK_STACK_SIZE],
        }
    }

    fn top(&self) -> usize {
        self.bytes.as_ptr() as usize + TASK_STACK_SIZE
    }
}

static mut TASK_STACKS: [KernelStack; MAX_TASKS] = [KernelStack::new(); MAX_TASKS];

/// Return the top address of one fixed teaching task stack.
pub fn task_stack_top(id: TaskId) -> Result<usize, TaskError> {
    let index = id.value();
    if index >= MAX_TASKS {
        return Err(TaskError::InvalidTaskId);
    }
    let base = core::ptr::addr_of!(TASK_STACKS).cast::<KernelStack>();
    // SAFETY: `index` is checked against MAX_TASKS and this function only
    // computes the address of the fixed stack. It does not create references to
    // or read/write the mutable static stack contents.
    let stack_top = unsafe { (*base.add(index)).top() };
    Ok(stack_top & !(STACK_ALIGN - 1))
}

/// Planned cooperative yield entry.
pub fn yield_now() -> Result<(), TaskError> {
    // TODO(LAB5-T2): mark the current task Ready and enter the scheduler.
    Err(TaskError::Unimplemented)
}

/// Planned scheduler entry.
pub fn schedule(_manager: &mut TaskManager) -> Result<(), TaskError> {
    // TODO(LAB5-T2): switch from the current task context to the next task.
    Err(TaskError::Unimplemented)
}

unsafe extern "C" {
    /// Switch from `current` to `next`.
    ///
    /// Lab5 starter only links the symbol. The full save/restore sequence is a
    /// student task for the solution branch.
    pub fn __switch(current: *mut TaskContext, next: *const TaskContext);
}

/// Check that the Lab5 starter interfaces are wired without completing Lab5.
pub fn starter_interfaces_are_present() -> bool {
    let task_id = TaskId::new(0);
    let stack_top = match task_stack_top(task_id) {
        Ok(stack_top) => stack_top,
        Err(_) => return false,
    };
    let task = TaskControlBlock::new(task_id, demo_task_entry, stack_top);
    let mut manager = TaskManager::new();

    task.status() == TaskStatus::Ready
        && task.stack_top().is_multiple_of(STACK_ALIGN)
        && manager.task_count() == 0
        && manager.add_task(task) == Err(TaskError::Unimplemented)
        && manager.fetch_next() == Err(TaskError::Unimplemented)
        && manager.run_next() == Err(TaskError::Unimplemented)
        && schedule(&mut manager) == Err(TaskError::Unimplemented)
        && yield_now() == Err(TaskError::Unimplemented)
}

/// Return whether Lab5 task 1 task-table work is complete.
pub fn task_table_stage_is_complete() -> bool {
    let task_id = TaskId::new(0);
    let stack_top = match task_stack_top(task_id) {
        Ok(stack_top) => stack_top,
        Err(_) => return false,
    };
    let task = TaskControlBlock::new(task_id, demo_task_entry, stack_top);
    let mut manager = TaskManager::new();

    task.status() == TaskStatus::Ready
        && task.context().ra != 0
        && task.context().sp == stack_top
        && manager.add_task(task).is_ok()
        && manager.task_count() == 1
}

/// Return whether Lab5 task 2 round-robin work is complete.
pub fn round_robin_stage_is_complete() -> bool {
    let mut manager = TaskManager::new();

    let mut id_value = 0;
    while id_value < 3 {
        let id = TaskId::new(id_value);
        let stack_top = match task_stack_top(id) {
            Ok(stack_top) => stack_top,
            Err(_) => return false,
        };
        if manager
            .add_task(TaskControlBlock::new(id, demo_task_entry, stack_top))
            .is_err()
        {
            return false;
        }
        id_value += 1;
    }

    manager.fetch_next() == Ok(TaskId::new(0))
        && manager.fetch_next() == Ok(TaskId::new(1))
        && manager.fetch_next() == Ok(TaskId::new(2))
        && manager.fetch_next() == Ok(TaskId::new(0))
}

extern "C" fn demo_task_entry() -> ! {
    loop {
        core::hint::spin_loop();
    }
}
