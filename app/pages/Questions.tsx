import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import api from '@/api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  SINGLE: '单选题',
  MULTIPLE: '多选题',
  JUDGE: '判断题',
  FILL: '填空题',
  SHORT_ANSWER: '简答题',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '待收录',
  ANSWERED: '已解答',
  VERIFIED: '已验证',
  REJECTED: '已拒绝',
};

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  ANSWERED: 'bg-primary text-primary-foreground',
  VERIFIED: 'bg-green-800 text-white',
  REJECTED: 'bg-muted text-muted-foreground/60',
};

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '待收录' },
  { value: 'ANSWERED', label: '已解答' },
  { value: 'VERIFIED', label: '已验证' },
  { value: 'REJECTED', label: '已拒绝' },
];

interface Question {
  id: string;
  title: string;
  type: string;
  status: string;
  answer: string[];
  [key: string]: any;
}

const EMPTY_CREATE = { type: 'SINGLE', title: '', answer: '', tags: '' };

/** 把答案存储值（jsonb 数组或历史 '#' 拼接文本）格式化为可读文本 */
function formatAnswer(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean).join(' / ');
  }
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr.map((x) => String(x).trim()).filter(Boolean).join(' / ');
      }
    } catch {
      // 非法 JSON，按原文显示
    }
  }
  return text;
}

export default function Questions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // 批量选择（点击“批量处理”进入批量模式后才显示复选框）
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE });

  // 标注答案弹窗
  const [answerTarget, setAnswerTarget] = useState<Question | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [answering, setAnswering] = useState(false);
  // 多选题专用：多个答案文本框（每个输入框对应一个答案项，可自由添加/删除）
  const [answerInputs, setAnswerInputs] = useState<string[]>(['']);

  // 确认弹窗（替代 window.confirm：单个拒绝 / 批量操作）
  type ConfirmAction =
    | { type: 'reject-single'; id: string }
    | { type: 'batch'; action: 'verify' | 'reject' | 'delete' };
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  // 批量补全答案弹窗（选择来源：其它题库 / AI）
  const [answerDialogOpen, setAnswerDialogOpen] = useState(false);
  const [answerMode, setAnswerMode] = useState<'upstream' | 'ai'>('upstream');
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState('');

  // 内联通知（替代 js alert，自动消失；成功为绿色，错误为红色）
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error'>('error');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 显示内联通知（含失败明细时延长展示） */
  function showNotice(msg: string, extra = '', type: 'success' | 'error' = 'error') {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(extra ? `${msg}${extra}` : msg);
    setNoticeType(type);
    noticeTimer.current = setTimeout(() => setNotice(''), extra ? 8000 : 3000);
  }

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  async function fetchQuestions(p?: number, ps?: number) {
    const targetPage = p ?? page;
    const targetSize = ps ?? pageSize;
    if (p) setPage(p);
    if (ps) setPageSize(ps);
    setLoading(true);
    setError('');

    try {
      const params: any = { page: targetPage, pageSize: targetSize };
      if (statusFilter) {
        params.status = statusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      const { data } = await api.get('/search/pending', { params });
      if (data.code === 1) {
        setQuestions(data.data.items);
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      } else {
        setQuestions([]);
      }
      setSelected(new Set());
    } catch {
      setError('加载失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQuestions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (!answerTarget) return;
    const isMulti = answerTarget.type === 'MULTIPLE';
    // 多选题：每个输入框是一个答案项，过滤空值后按 '#' 拼接提交（服务端 parseAnswerInput 拆回数组）
    const input = isMulti
      ? answerInputs.map((s) => s.trim()).filter(Boolean).join('#')
      : answerInput;
    if (!input) return;
    setAnswering(true);
    try {
      await api.patch(`/search/${answerTarget.id}/answer`, { answer: input });
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === answerTarget.id
            ? {
                ...q,
                answer: input.split('#').map((s) => s.trim()).filter(Boolean),
                status: 'ANSWERED',
              }
            : q
        )
      );
      setAnswerTarget(null);
      setAnswerInput('');
      setAnswerInputs(['']);
    } catch {
      showNotice('保存答案失败');
    } finally {
      setAnswering(false);
    }
  }

  /** 多选题编辑器：修改 / 添加 / 删除答案文本框 */
  function updateAnswerInput(i: number, value: string) {
    setAnswerInputs((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }
  function addAnswerInput() {
    setAnswerInputs((prev) => [...prev, '']);
  }
  function removeAnswerInput(i: number) {
    setAnswerInputs((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function verifyQuestion(id: string) {
    try {
      await api.patch(`/search/${id}/verify`);
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: 'VERIFIED' } : q))
      );
    } catch {
      showNotice('验证失败');
    }
  }

  /** 单个拒绝：打开确认弹窗，由 executeConfirm 执行 */
  function rejectQuestion(id: string) {
    setConfirmError('');
    setConfirmAction({ type: 'reject-single', id });
  }

  async function restoreQuestion(id: string) {
    try {
      const { data } = await api.patch(`/search/${id}/restore`);
      const nextStatus = data.data?.status;
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== id || !nextStatus) return q;
          // 设为待收录时后端已清空答案，本地同步
          return nextStatus === 'PENDING' ? { ...q, status: nextStatus, answer: [] } : { ...q, status: nextStatus };
        })
      );
    } catch {
      showNotice('恢复失败');
    }
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) questions.forEach((q) => next.add(q.id));
      else questions.forEach((q) => next.delete(q.id));
      return next;
    });
  }

  function toggleBatchMode() {
    setBatchMode((v) => !v);
    setSelected(new Set());
  }

  /** 批量操作：打开确认弹窗，由 executeConfirm 执行 */
  function batchOperate(action: 'verify' | 'reject' | 'delete') {
    if (selected.size === 0) return;
    setConfirmError('');
    setConfirmAction({ type: 'batch', action });
  }

  /** 批量补全答案：在弹窗中选择来源后执行 */
  async function executeBatchAnswer() {
    setAnswerLoading(true);
    setAnswerError('');
    try {
      const { data } = await api.post('/search/batch-answer', {
        mode: answerMode,
        ids: [...selected],
      });
      if (data.code === 1) {
        const r = data.data;
        showNotice(
          `${answerMode === 'upstream' ? '其它题库拉取' : 'AI 作答'}完成：成功 ${r.succeeded}，跳过 ${r.skipped}，失败 ${r.failed}`,
          r.failed > 0 && r.failedTitles?.length ? `，未命中如：${r.failedTitles.join('；')}` : '',
          r.failed > 0 ? 'error' : 'success',
        );
      }
      setAnswerDialogOpen(false);
      await fetchQuestions();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setAnswerError(msg || '操作失败，请重试');
    } finally {
      setAnswerLoading(false);
    }
  }

  /** 确认弹窗回调：执行实际操作 */
  async function executeConfirm() {
    if (!confirmAction) return;
    setConfirmLoading(true);
    setConfirmError('');
    try {
      if (confirmAction.type === 'reject-single') {
        await api.patch(`/search/${confirmAction.id}/reject`);
        const id = confirmAction.id;
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === id ? { ...q, status: 'REJECTED' } : q
          )
        );
      } else {
        await api.patch('/search/batch', { action: confirmAction.action, ids: [...selected] });
        await fetchQuestions();
      }
      setConfirmAction(null);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setConfirmError(msg || '操作失败，请重试');
    } finally {
      setConfirmLoading(false);
    }
  }

  async function submitCreateQuestion(e: FormEvent) {
    e.preventDefault();
    if (!createForm.title) {
      showNotice('请输入题目标题');
      return;
    }
    try {
      const tags = createForm.tags
        ? createForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
      await api.post('/search', {
        title: createForm.title,
        type: createForm.type,
        answer: createForm.answer || undefined,
        tags,
      });
      setShowCreateDialog(false);
      setCreateForm({ ...EMPTY_CREATE });
      fetchQuestions(1);
    } catch {
      showNotice('创建题目失败');
    }
  }

  const allSelected = questions.length > 0 && questions.every((q) => selected.has(q.id));
  const someSelected = questions.some((q) => selected.has(q.id));

  // 标注答案弹窗：多选题切换为多个文本框编辑器
  const isMultiEdit = answerTarget?.type === 'MULTIPLE';

  /** 确认弹窗的标题/描述/按钮文案（按操作类型） */
  const confirmContent = (() => {
    if (!confirmAction) return null;
    if (confirmAction.type === 'reject-single') {
      return {
        title: '标为已拒绝',
        description: '确定将该题目标为已拒绝吗？',
        confirmText: '拒绝',
        destructive: true,
      };
    }
    const n = selected.size;
    if (confirmAction.type === 'batch') {
      if (confirmAction.action === 'verify') {
        return {
          title: '批量验证',
          description: `确定批量验证选中的 ${n} 道题目吗？（仅"已解答"状态的题目会生效）`,
          confirmText: '验证',
          destructive: false,
        };
      }
      if (confirmAction.action === 'reject') {
        return {
          title: '批量拒绝',
          description: `确定批量拒绝选中的 ${n} 道题目吗？`,
          confirmText: '拒绝',
          destructive: true,
        };
      }
      return {
        title: '批量删除',
        description: `确定删除选中的 ${n} 道题目吗？（仅"已拒绝"状态的题目会被删除，删除后不可恢复）`,
        confirmText: '删除',
        destructive: true,
      };
    }
    return null;
  })();

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h2 className="text-2xl font-bold">题目管理</h2>
        <div className="flex flex-wrap gap-3">
          <Input
            type="text"
            placeholder="搜索题目..."
            className="w-56"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchQuestions(1)}
          />
          <Select
            value={statusFilter || 'ALL'}
            onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={batchMode ? 'default' : 'outline'} onClick={toggleBatchMode}>
            {batchMode ? '退出批量处理' : '批量处理'}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            新增题目
          </Button>
        </div>
      </div>

      {/* 内联通知（3s/8s 自动消失，替代 js alert；成功绿色、错误红色） */}
      {notice && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 mb-4 max-w-3xl rounded-lg border px-4 py-2.5 text-sm',
            noticeType === 'success'
              ? 'border-green-600/40 bg-green-500/10 text-green-700'
              : 'border-destructive/50 bg-destructive/10 text-destructive',
          )}
        >
          <span>{notice}</span>
          <X className="size-4 cursor-pointer shrink-0" onClick={() => setNotice('')} />
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            加载中...
          </CardContent>
        </Card>
      )}

      {/* 错误状态 */}
      {!loading && error && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive mb-2">{error}</p>
            <Button variant="link" onClick={() => fetchQuestions(1)}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 题目列表 */}
      {!loading && !error && (
        <>
          {/* 批量操作栏（批量模式下且存在选中项时显示） */}
          {batchMode && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border bg-muted/40 px-4 py-2.5">
              <span className="text-sm font-medium">已选 {selected.size} 项</span>
              <Button size="sm" variant="outline" onClick={() => batchOperate('verify')}>
                批量验证
              </Button>
              <Button size="sm" variant="outline" onClick={() => batchOperate('reject')}>
                批量拒绝
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAnswerMode('upstream');
                  setAnswerError('');
                  setAnswerDialogOpen(true);
                }}
              >
                批量补全答案
              </Button>
              <Button size="sm" variant="destructive" onClick={() => batchOperate('delete')}>
                批量删除
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                取消选择
              </Button>
            </div>
          )}

          <Card className="py-0 gap-0 overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                {batchMode && (
                  <TableHead className="px-4 py-3 w-10">
                    <input
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected;
                      }}
                      type="checkbox"
                      className="size-4 cursor-pointer accent-primary align-middle"
                      checked={allSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </TableHead>
                )}
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">题目</TableHead>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">类型</TableHead>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">答案</TableHead>
                <TableHead className="px-6 py-3 text-right text-xs uppercase tracking-wider">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={batchMode ? 5 : 4} className="px-6 py-12 text-center text-muted-foreground">
                    暂无题目数据
                  </TableCell>
                </TableRow>
              )}
              {questions.map((q) => (
                <TableRow key={q.id}>
                  {batchMode && (
                    <TableCell className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-primary align-middle"
                        checked={selected.has(q.id)}
                        onChange={(e) => toggleSelect(q.id, e.target.checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="px-6 py-4 text-sm whitespace-normal min-w-64">
                    {q.title}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                    {TYPE_LABELS[q.type] || q.type}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-sm font-medium whitespace-normal min-w-32">
                    <span className="inline-flex items-center gap-1.5">
                      {formatAnswer(q.answer) || '-'}
                      {(q.status === 'PENDING' || q.status === 'ANSWERED' || q.status === 'REJECTED') && (
                        <button
                          type="button"
                          title={q.status === 'PENDING' ? '标注答案' : '编辑答案'}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                          onClick={() => {
                            setAnswerTarget(q);
                            if (q.type === 'MULTIPLE') {
                              // 多选题：每个答案项一个文本框，至少保留一个
                              const parts = (Array.isArray(q.answer) ? q.answer : []).map((s) => String(s).trim()).filter(Boolean);
                              setAnswerInputs(parts.length > 0 ? parts : ['']);
                              setAnswerInput('');
                            } else {
                              setAnswerInputs(['']);
                              setAnswerInput((Array.isArray(q.answer) ? q.answer : []).join('#'));
                            }
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    {/* 点击状态徽章可直接切换状态（复用现有接口） */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Badge
                          className={`cursor-pointer hover:opacity-80 ${STATUS_CLASSES[q.status] || ''}`}
                        >
                          {STATUS_LABELS[q.status] || q.status}
                        </Badge>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {q.status === 'ANSWERED' && (
                          <DropdownMenuItem onSelect={() => verifyQuestion(q.id)}>
                            标为已验证
                          </DropdownMenuItem>
                        )}
                        {q.status === 'VERIFIED' && (
                          <DropdownMenuItem onSelect={() => restoreQuestion(q.id)}>
                            取消验证（恢复为已解答）
                          </DropdownMenuItem>
                        )}
                        {q.status === 'REJECTED' && (
                          <DropdownMenuItem onSelect={() => restoreQuestion(q.id)}>
                            恢复为待收录
                          </DropdownMenuItem>
                        )}
                        {(q.status === 'PENDING' || q.status === 'ANSWERED') && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => rejectQuestion(q.id)}
                          >
                            标为已拒绝
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* 分页 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex items-center gap-1.5">
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => fetchQuestions(1, Number(v))}
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} 条/页
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => fetchQuestions(page - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => fetchQuestions(page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </Card>
        </>
      )}

      {/* 创建题目弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>手动录入题目</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreateQuestion} className="space-y-4">
            <div className="space-y-1.5">
              <Label>题目类型</Label>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm({ ...createForm, type: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">单选题</SelectItem>
                  <SelectItem value="MULTIPLE">多选题</SelectItem>
                  <SelectItem value="JUDGE">判断题</SelectItem>
                  <SelectItem value="FILL">填空题</SelectItem>
                  <SelectItem value="SHORT_ANSWER">简答题</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-title">题目标题</Label>
              <Textarea
                id="q-title"
                placeholder="请输入题目内容"
                rows={3}
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-answer">答案</Label>
              <Input
                id="q-answer"
                type="text"
                placeholder="请输入答案"
                value={createForm.answer}
                onChange={(e) => setCreateForm({ ...createForm, answer: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-tags">标签（逗号分隔）</Label>
              <Input
                id="q-tags"
                type="text"
                placeholder="如: 数学, 代数"
                value={createForm.tags}
                onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreateDialog(false)}>
                取消
              </Button>
              <Button type="submit">创建</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 标注答案弹窗 */}
      <Dialog
        open={!!answerTarget}
        onOpenChange={(open) => !open && setAnswerTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {answerTarget?.status === 'PENDING' ? '标注答案' : '编辑答案'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {answerTarget?.title}
          </p>
          <form onSubmit={submitAnswer} className="space-y-4">
            {isMultiEdit ? (
              <div className="space-y-1.5">
                <Label>答案（每项一个输入框）</Label>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {answerInputs.map((value, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder={`答案 ${i + 1}`}
                        value={value}
                        onChange={(e) => updateAnswerInput(i, e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="删除此答案"
                        onClick={() => removeAnswerInput(i)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addAnswerInput}
                >
                  <Plus className="size-4" />
                  添加答案项
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="q-answer-input">答案</Label>
                <Input
                  id="q-answer-input"
                  type="text"
                  autoFocus
                  placeholder="请输入答案，多空用 # 分隔"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAnswerTarget(null)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={
                  answering ||
                  (isMultiEdit
                    ? answerInputs.every((s) => !s.trim())
                    : !answerInput)
                }
              >
                {answering ? '提交中...' : '确认'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 操作确认弹窗（单个拒绝 / 批量操作） */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmContent?.title ?? ''}
        description={confirmContent?.description}
        confirmText={confirmContent?.confirmText ?? '确定'}
        destructive={confirmContent?.destructive}
        loading={confirmLoading}
        error={confirmError}
        onConfirm={executeConfirm}
      />

      {/* 批量补全答案弹窗（选择来源：其它题库 / AI） */}
      <Dialog
        open={answerDialogOpen}
        onOpenChange={(open) => {
          if (!answerLoading) setAnswerDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>批量补全答案</DialogTitle>
            <DialogDescription>
              对选中的 {selected.size} 道题目补全答案，仅「待收录」状态的题目会生效（已拒绝/已解答/已验证自动跳过），题目较多时可能耗时较长。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>答案来源</Label>
            <Select
              value={answerMode}
              onValueChange={(v) => setAnswerMode(v as 'upstream' | 'ai')}
              disabled={answerLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upstream">从其它题库拉取</SelectItem>
                <SelectItem value="ai">AI 作答</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {answerMode === 'upstream'
                ? '并发查询启用的其它题库，按配置顺序取第一个命中；命中后记录来源题库名。补全时无视其它题库总开关，但已禁用的单个题库仍会跳过。'
                : '按作答模型链优先级依次尝试，失败自动降级下一模型（不受「AI 答题范围」与 AI 搜题总开关限制，但已禁用的单个模型仍会跳过）。'}
            </p>
          </div>
          {answerError && <p className="text-sm text-destructive">{answerError}</p>}
          <DialogFooter>
            <Button variant="ghost" disabled={answerLoading} onClick={() => setAnswerDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={executeBatchAnswer} disabled={answerLoading}>
              {answerLoading ? '处理中...' : answerMode === 'upstream' ? '拉取答案' : '开始作答'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
