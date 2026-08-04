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
    pub fn goto(entry: TaskEntry, stack_top: usize) -> Self {
        Self {
            ra: entry as *const () as usize,
            sp: stack_top & !(STACK_ALIGN - 1),
            s: [0; 12],
        }
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
    scheduler_context: TaskContext,
}

impl TaskManager {
    /// Create an empty task manager.
    pub const fn new() -> Self {
        Self {
            tasks: [None; MAX_TASKS],
            current: None,
            next_scan: 0,
            scheduler_context: TaskContext::zero(),
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
    pub fn add_task(&mut self, task: TaskControlBlock) -> Result<(), TaskError> {
        let index = task.id().value();
        if index >= MAX_TASKS {
            return Err(TaskError::InvalidTaskId);
        }
        if self.tasks[index].is_some() {
            return Err(TaskError::TaskTableFull);
        }
        self.tasks[index] = Some(task);
        Ok(())
    }

    /// Fetch the next ready task id using round-robin order.
    pub fn fetch_next(&mut self) -> Result<TaskId, TaskError> {
        let mut checked = 0;
        while checked < MAX_TASKS {
            let index = (self.next_scan + checked) % MAX_TASKS;
            if let Some(task) = self.tasks[index].as_ref() {
                if task.status == TaskStatus::Ready {
                    self.next_scan = (index + 1) % MAX_TASKS;
                    return Ok(task.id());
                }
            }
            checked += 1;
        }
        Err(TaskError::NoReadyTask)
    }

    /// Run the next ready task.
    pub fn run_next(&mut self) -> Result<(), TaskError> {
        if let Some(current) = self.current {
            let task = self.task_mut(current)?;
            if task.status == TaskStatus::Running {
                task.status = TaskStatus::Ready;
            }
        }

        let next = self.fetch_next()?;
        self.task_mut(next)?.status = TaskStatus::Running;
        self.current = Some(next);
        Ok(())
    }

    /// Return true when all inserted tasks have exited.
    pub fn all_tasks_exited(&self) -> bool {
        let mut saw_task = false;
        let mut index = 0;
        while index < MAX_TASKS {
            if let Some(task) = self.tasks[index].as_ref() {
                saw_task = true;
                if task.status != TaskStatus::Exited {
                    return false;
                }
            }
            index += 1;
        }
        saw_task
    }

    fn task_mut(&mut self, id: TaskId) -> Result<&mut TaskControlBlock, TaskError> {
        let index = id.value();
        if index >= MAX_TASKS {
            return Err(TaskError::InvalidTaskId);
        }
        match self.tasks[index].as_mut() {
            Some(task) => Ok(task),
            None => Err(TaskError::InvalidTaskId),
        }
    }

    fn context_mut_ptr(&mut self, id: TaskId) -> Result<*mut TaskContext, TaskError> {
        Ok(core::ptr::addr_of_mut!(self.task_mut(id)?.context))
    }

    fn scheduler_context_mut_ptr(&mut self) -> *mut TaskContext {
        core::ptr::addr_of_mut!(self.scheduler_context)
    }

    fn mark_current_ready(&mut self) -> Result<TaskId, TaskError> {
        let current = match self.current {
            Some(current) => current,
            None => return Err(TaskError::NoReadyTask),
        };
        self.task_mut(current)?.status = TaskStatus::Ready;
        self.current = None;
        Ok(current)
    }

    fn mark_current_exited(&mut self) -> Result<TaskId, TaskError> {
        let current = match self.current {
            Some(current) => current,
            None => return Err(TaskError::NoReadyTask),
        };
        self.task_mut(current)?.status = TaskStatus::Exited;
        self.current = None;
        Ok(current)
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
static mut TASK_MANAGER: TaskManager = TaskManager::new();

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
    let (current_context, scheduler_context) = unsafe {
        let manager = global_manager_mut();
        let current = manager.mark_current_ready()?;
        (
            manager.context_mut_ptr(current)?,
            manager.scheduler_context_mut_ptr().cast_const(),
        )
    };

    // SAFETY: Lab5 is single-hart and cooperative. The current task has a
    // valid saved context slot, the scheduler context was created by
    // `run_ready_tasks`, and no interrupt path can concurrently mutate them.
    unsafe {
        switch_context(current_context, scheduler_context);
    }
    Ok(())
}

/// Planned scheduler entry.
pub fn schedule(manager: &mut TaskManager) -> Result<(), TaskError> {
    manager.run_next()
}

/// Reset the global teaching scheduler.
pub fn reset_global_manager() {
    // SAFETY: Lab5 uses one hart and performs all task setup before scheduling
    // starts, so replacing the global manager cannot race with a running task.
    unsafe {
        *core::ptr::addr_of_mut!(TASK_MANAGER) = TaskManager::new();
    }
}

/// Insert one fixed kernel task into the global scheduler.
pub fn spawn_kernel_task(id: TaskId, entry: TaskEntry) -> Result<(), TaskError> {
    let stack_top = task_stack_top(id)?;
    let task = TaskControlBlock::new(id, entry, stack_top);
    // SAFETY: Lab5 task setup is single-threaded and happens before the
    // scheduler starts.
    unsafe { global_manager_mut().add_task(task) }
}

/// Run ready tasks until every inserted task exits.
pub fn run_ready_tasks() -> Result<(), TaskError> {
    loop {
        let (scheduler_context, next_context) = unsafe {
            let manager = global_manager_mut();
            match manager.run_next() {
                Ok(()) => {
                    let current = match manager.current {
                        Some(current) => current,
                        None => return Err(TaskError::NoReadyTask),
                    };
                    (
                        manager.scheduler_context_mut_ptr(),
                        manager.context_mut_ptr(current)?.cast_const(),
                    )
                }
                Err(TaskError::NoReadyTask) if manager.all_tasks_exited() => return Ok(()),
                Err(error) => return Err(error),
            }
        };

        // SAFETY: The selected task context points to one TCB owned by the
        // global manager. The scheduler context belongs to the same manager and
        // is kept alive for the whole scheduling run.
        unsafe {
            switch_context(scheduler_context, next_context);
        }
    }
}

/// Mark the current task as exited and switch back to the scheduler.
pub fn exit_current() -> ! {
    let contexts = unsafe {
        let manager = global_manager_mut();
        match manager.mark_current_exited() {
            Ok(current) => match manager.context_mut_ptr(current) {
                Ok(current_context) => Ok((
                    current_context,
                    manager.scheduler_context_mut_ptr().cast_const(),
                )),
                Err(error) => Err(error),
            },
            Err(error) => Err(error),
        }
    };

    let (current_context, scheduler_context) = match contexts {
        Ok(contexts) => contexts,
        Err(_) => loop {
            core::hint::spin_loop();
        },
    };

    // SAFETY: The exiting task owns `current_context`, and the scheduler
    // context remains valid for the whole `run_ready_tasks` call.
    unsafe {
        switch_context(current_context, scheduler_context);
    }

    loop {
        core::hint::spin_loop();
    }
}

unsafe fn global_manager_mut() -> &'static mut TaskManager {
    &mut *core::ptr::addr_of_mut!(TASK_MANAGER)
}

#[cfg(target_arch = "riscv64")]
unsafe extern "C" {
    /// Switch from `current` to `next`.
    ///
    /// Saves and restores `ra`, `sp` and `s0..s11`.
    pub fn __switch(current: *mut TaskContext, next: *const TaskContext);
}

unsafe fn switch_context(current: *mut TaskContext, next: *const TaskContext) {
    #[cfg(target_arch = "riscv64")]
    {
        __switch(current, next);
    }

    #[cfg(not(target_arch = "riscv64"))]
    {
        let _ = current;
        let _ = next;
    }
}

/// Check that the Lab5 scheduler interfaces are wired.
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
        && manager.add_task(task).is_ok()
        && manager.fetch_next() == Ok(task_id)
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

#[cfg(test)]
mod tests {
    use super::*;

    extern "C" fn test_task_a() -> ! {
        loop {
            core::hint::spin_loop();
        }
    }

    extern "C" fn test_task_b() -> ! {
        loop {
            core::hint::spin_loop();
        }
    }

    extern "C" fn test_task_c() -> ! {
        loop {
            core::hint::spin_loop();
        }
    }

    fn test_task(id: usize, entry: TaskEntry) -> TaskControlBlock {
        TaskControlBlock::new(TaskId::new(id), entry, 0x8020_8008 + id * TASK_STACK_SIZE)
    }

    #[test]
    fn task_context_goto_sets_entry_and_aligned_stack() {
        let context = TaskContext::goto(test_task_a, 0x8020_800f);

        assert_eq!(context.ra, test_task_a as *const () as usize);
        assert_eq!(context.sp, 0x8020_8000);
        assert_eq!(context.s, [0; 12]);
    }

    #[test]
    fn manager_adds_tasks_and_rejects_duplicate_id() {
        let mut manager = TaskManager::new();

        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.task_count(), 1);
        assert!(manager.add_task(test_task(0, test_task_b)).is_err());
        assert_eq!(manager.task_count(), 1);
    }

    #[test]
    fn fetch_next_uses_round_robin_ready_order() {
        let mut manager = TaskManager::new();
        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.add_task(test_task(1, test_task_b)), Ok(()));
        assert_eq!(manager.add_task(test_task(2, test_task_c)), Ok(()));

        assert_eq!(manager.fetch_next(), Ok(TaskId::new(0)));
        assert_eq!(manager.fetch_next(), Ok(TaskId::new(1)));
        assert_eq!(manager.fetch_next(), Ok(TaskId::new(2)));
        assert_eq!(manager.fetch_next(), Ok(TaskId::new(0)));
    }

    #[test]
    fn fetch_next_skips_exited_tasks() {
        let mut manager = TaskManager::new();
        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.add_task(test_task(1, test_task_b)), Ok(()));

        manager.tasks[0].as_mut().unwrap().status = TaskStatus::Exited;
        assert_eq!(manager.fetch_next(), Ok(TaskId::new(1)));
        manager.tasks[1].as_mut().unwrap().status = TaskStatus::Exited;
        assert_eq!(manager.fetch_next(), Err(TaskError::NoReadyTask));
    }

    #[test]
    fn run_next_marks_selected_task_running() {
        let mut manager = TaskManager::new();
        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.add_task(test_task(1, test_task_b)), Ok(()));

        assert_eq!(manager.run_next(), Ok(()));
        assert_eq!(manager.current, Some(TaskId::new(0)));
        assert_eq!(
            manager.tasks[0].as_ref().unwrap().status,
            TaskStatus::Running
        );
        assert_eq!(manager.tasks[1].as_ref().unwrap().status, TaskStatus::Ready);
    }

    #[test]
    fn mark_current_ready_models_cooperative_yield() {
        let mut manager = TaskManager::new();
        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.run_next(), Ok(()));

        assert_eq!(manager.mark_current_ready(), Ok(TaskId::new(0)));
        assert_eq!(manager.current, None);
        assert_eq!(manager.tasks[0].as_ref().unwrap().status, TaskStatus::Ready);
    }

    #[test]
    fn exited_task_is_not_scheduled_again() {
        let mut manager = TaskManager::new();
        assert_eq!(manager.add_task(test_task(0, test_task_a)), Ok(()));
        assert_eq!(manager.add_task(test_task(1, test_task_b)), Ok(()));
        assert_eq!(manager.run_next(), Ok(()));

        assert_eq!(manager.mark_current_exited(), Ok(TaskId::new(0)));
        assert_eq!(manager.current, None);
        assert_eq!(
            manager.tasks[0].as_ref().unwrap().status,
            TaskStatus::Exited
        );
        assert_eq!(manager.fetch_next(), Ok(TaskId::new(1)));
    }
}
