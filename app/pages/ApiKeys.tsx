import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApiKeyItem {
  id: string;
  key: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** 复制文本到剪贴板（非安全上下文回退 execCommand） */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 回退到 execCommand
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function formatTime(v: string | null): string {
  if (!v) return '-';
  return new Date(v).toLocaleString('zh-CN', { hour12: false });
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error'>('error');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // 创建成功后一次性展示完整 key 的弹窗
  const [createdKey, setCreatedKey] = useState<ApiKeyItem | null>(null);
  const [createdCopied, setCreatedCopied] = useState(false);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  function showNotice(msg: string, type: 'success' | 'error' = 'error') {
    setNotice(msg);
    setNoticeType(type);
    setTimeout(() => setNotice(''), 3000);
  }

  async function fetchKeys() {
    setLoading(true);
    try {
      const { data } = await api.get('/keys');
      if (data.code === 1) setKeys(data.data.items);
    } catch {
      showNotice('加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/keys', { name: newName || undefined });
      if (data.code === 1) {
        setShowCreate(false);
        setNewName('');
        setCreatedKey(data.data);
        setCreatedCopied(false);
        fetchKeys();
      }
    } catch {
      showNotice('创建失败');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/keys/${deleteTarget.id}`);
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      setDeleteTarget(null);
      showNotice('已删除', 'success');
    } catch {
      showNotice('删除失败');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopy(item: ApiKeyItem, once: () => void) {
    const ok = await copyText(item.key);
    if (ok) {
      once();
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      showNotice('复制失败，请手动选择文本复制');
    }
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h2 className="text-2xl font-bold">API 密钥</h2>
          <p className="text-sm text-muted-foreground mt-1">
            用于搜题接口（OCSJS / TikuAdapter）的 token 鉴权，请妥善保管，泄露后立即删除重建
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="size-4" />
          新建密钥
        </Button>
      </div>

      {notice && (
        <div
          className={
            'mb-4 max-w-3xl rounded-lg border px-4 py-2.5 text-sm ' +
            (noticeType === 'success'
              ? 'border-green-600/40 bg-green-500/10 text-green-700'
              : 'border-destructive/50 bg-destructive/10 text-destructive')
          }
        >
          {notice}
        </div>
      )}

      <Card className="max-w-3xl py-0 gap-0">
        {loading ? (
          <CardContent className="py-10 text-center text-muted-foreground">加载中...</CardContent>
        ) : keys.length === 0 ? (
          <CardContent className="py-10 text-center text-muted-foreground">
            <KeyRound className="size-8 mx-auto mb-3 opacity-40" />
            还没有 API Key，点击右上角「新建密钥」生成
          </CardContent>
        ) : (
          <div className="divide-y">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{k.name || '未命名密钥'}</span>
                    {k.lastUsedAt && (
                      <Badge variant="secondary" className="text-xs">使用中</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-md">
                    {k.key.slice(0, 12)}...{k.key.slice(-4)}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    创建于 {formatTime(k.createdAt)}，最后使用 {formatTime(k.lastUsedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="复制完整密钥"
                    onClick={() => handleCopy(k, () => setCopiedId(k.id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedId === k.id ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="删除"
                    onClick={() => setDeleteTarget(k)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 创建弹窗 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建 API Key</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">备注名称（可选）</Label>
              <Input
                id="key-name"
                type="text"
                autoFocus
                placeholder="如：我的笔记本"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={50}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                取消
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 创建成功：一次性展示完整密钥 */}
      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>API Key 已创建</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            完整密钥如下，可随时在列表中复制，泄露后请立即删除：
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted rounded-md px-3 py-2 text-sm font-mono break-all">
              {createdKey?.key}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              title="复制"
              onClick={() => createdKey && handleCopy(createdKey, () => setCreatedCopied(true))}
            >
              {createdCopied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除 API Key"
        description={`确定删除「${deleteTarget?.name || '未命名密钥'}」吗？使用该密钥的搜题配置将立即失效。`}
        confirmText="删除"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
