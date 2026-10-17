import { useEffect, useState, type FormEvent } from 'react';
import api from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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

const ROLE_LABELS: Record<string, string> = {
  OWNER: '拥有者',
  ADMIN: '管理员',
  USER: '用户',
};

const ROLE_CLASSES: Record<string, string> = {
  OWNER: 'bg-red-100 text-red-700',
  ADMIN: 'bg-primary text-primary-foreground',
  USER: 'bg-muted text-muted-foreground',
};

interface UserItem {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  [key: string]: any;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

const EMPTY_CREATE = { email: '', password: '', role: 'USER' };

export default function Users() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE });

  async function fetchUsers(p?: number) {
    const targetPage = p ?? page;
    if (p) setPage(p);
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/users', {
        params: { page: targetPage, pageSize: 20 },
      });
      if (data.code === 1) {
        setUsers(data.data.items);
        setTotal(data.data.total);
        setTotalPages(data.data.totalPages);
      }
    } catch {
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!createForm.email) {
      alert('请输入邮箱');
      return;
    }
    if (!createForm.password) {
      alert('请输入密码');
      return;
    }
    try {
      await api.post('/users', createForm);
      setShowCreateDialog(false);
      setCreateForm({ ...EMPTY_CREATE });
      fetchUsers(1);
    } catch {
      alert('创建用户失败');
    }
  }

  async function submitEditEmail(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (!editEmail) {
      alert('请输入新邮箱');
      return;
    }
    try {
      await api.patch(`/users/${editingUser.id}/email`, { email: editEmail });
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, email: editEmail } : u))
      );
      setShowEmailDialog(false);
    } catch {
      alert('修改邮箱失败');
    }
  }

  async function submitResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (!editPassword) {
      alert('请输入新密码');
      return;
    }
    try {
      await api.patch(`/users/${editingUser.id}/password`, { password: editPassword });
      setShowPasswordDialog(false);
      alert('密码已重置');
    } catch {
      alert('重置密码失败');
    }
  }

  async function toggleUserStatus(u: UserItem) {
    if (u.role === 'OWNER') return;
    try {
      await api.patch(`/users/${u.id}/status`, { isActive: !u.isActive });
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isActive: !u.isActive } : x))
      );
    } catch {
      alert('操作失败');
    }
  }

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h2 className="text-2xl font-bold">用户管理</h2>
        <Button onClick={() => setShowCreateDialog(true)}>新增用户</Button>
      </div>

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
            <Button variant="link" onClick={() => fetchUsers()}>
              重试
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 用户列表 */}
      {!loading && !error && (
        <Card className="py-0 gap-0 overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">邮箱</TableHead>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">角色</TableHead>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">状态</TableHead>
                <TableHead className="px-6 py-3 text-xs uppercase tracking-wider">注册时间</TableHead>
                <TableHead className="px-6 py-3 text-right text-xs uppercase tracking-wider">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    暂无用户数据
                  </TableCell>
                </TableRow>
              )}
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="px-6 py-4 text-sm">{u.email}</TableCell>
                  <TableCell className="px-6 py-4">
                    <Badge className={ROLE_CLASSES[u.role] || ''}>
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <Badge
                      className={
                        u.isActive
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-red-50 text-red-600'
                      }
                    >
                      {u.isActive ? '正常' : '已禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          操作
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-28">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingUser(u);
                            setEditEmail('');
                            setShowEmailDialog(true);
                          }}
                        >
                          改邮箱
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingUser(u);
                            setEditPassword('');
                            setShowPasswordDialog(true);
                          }}
                        >
                          改密码
                        </DropdownMenuItem>
                        {u.role !== 'OWNER' && (
                          <DropdownMenuItem onClick={() => toggleUserStatus(u)}>
                            {u.isActive ? '禁用' : '启用'}
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
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                共 {total} 条，第 {page}/{totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => fetchUsers(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => fetchUsers(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 修改邮箱弹窗 */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改邮箱</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">当前用户：{editingUser?.email}</p>
          <form onSubmit={submitEditEmail} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">新邮箱</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="新邮箱"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowEmailDialog(false)}>
                取消
              </Button>
              <Button type="submit">确认</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 重置密码弹窗 */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">当前用户：{editingUser?.email}</p>
          <form onSubmit={submitResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-password">新密码</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="新密码"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowPasswordDialog(false)}>
                取消
              </Button>
              <Button type="submit">确认</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 创建用户弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建用户</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCreateUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-email">邮箱</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="邮箱"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-password">密码</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="密码"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm({ ...createForm, role: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">用户</SelectItem>
                  <SelectItem value="ADMIN">管理员</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  );
}
