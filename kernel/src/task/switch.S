    .section .text.task_switch
    .align 2
    .global __switch
__switch:
    # TODO(student): save ra, sp and s0-s11 into the current TaskContext,
    # then restore them from the next TaskContext.
    # Starter deliberately returns immediately and does not perform a real
    # context switch.
    ret
