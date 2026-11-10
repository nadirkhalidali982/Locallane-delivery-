import { JOB_LABEL, JOB_TONE } from '../lib/format'
import type { JobStatus } from '../lib/api'
import { cn } from '../lib/cn'

export default function Pill({ status }: { status: JobStatus }) {
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', JOB_TONE[status])}>{JOB_LABEL[status]}</span>
}
