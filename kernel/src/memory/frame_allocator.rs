use super::PhysPageNum;

/// Errors reported by the Lab3 physical frame allocator.
#[allow(dead_code)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum FrameAllocatorError {
    /// The allocator has not been initialized with a valid frame range.
    NotInitialized,
    /// The released frame does not belong to the allocator's managed range.
    OutOfRange,
    /// The same frame was released more than once.
    DoubleFree,
    /// The starter intentionally leaves the operation for students.
    Unimplemented,
}

/// Minimal interface students implement in Lab3.
pub trait FrameAllocator {
    /// Initialize the allocator with a half-open page range [start, end).
    fn init(&mut self, start: PhysPageNum, end: PhysPageNum);

    /// Allocate one free physical page.
    fn alloc(&mut self) -> Option<PhysPageNum>;

    /// Return one previously allocated physical page.
    fn dealloc(&mut self, ppn: PhysPageNum) -> Result<(), FrameAllocatorError>;
}

/// Teaching-oriented stack frame allocator skeleton for Lab3.
pub struct StackFrameAllocator {
    start: PhysPageNum,
    end: PhysPageNum,
    next: PhysPageNum,
    initialized: bool,
}

impl StackFrameAllocator {
    /// Create an empty allocator skeleton.
    pub const fn new() -> Self {
        Self {
            start: PhysPageNum::new(0),
            end: PhysPageNum::new(0),
            next: PhysPageNum::new(0),
            initialized: false,
        }
    }

    /// Return the managed half-open page range.
    pub const fn bounds(&self) -> (PhysPageNum, PhysPageNum) {
        (self.start, self.end)
    }

    /// Return whether init has been called.
    pub const fn is_initialized(&self) -> bool {
        self.initialized
    }
}

impl Default for StackFrameAllocator {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameAllocator for StackFrameAllocator {
    fn init(&mut self, start: PhysPageNum, end: PhysPageNum) {
        // TODO(student): validate the range and prepare allocation metadata.
        self.start = start;
        self.end = end;
        self.next = start;
        self.initialized = true;
    }

    fn alloc(&mut self) -> Option<PhysPageNum> {
        // TODO(student): return the next free page and advance allocator state.
        let _ = self.next;
        None
    }

    fn dealloc(&mut self, ppn: PhysPageNum) -> Result<(), FrameAllocatorError> {
        // TODO(student): reject out-of-range, never-allocated, and double-free pages.
        let _ = ppn;
        Err(FrameAllocatorError::Unimplemented)
    }
}
