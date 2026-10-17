import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/context/auth';
import api from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    email: '',
    password: '',
    code: '',
  });

  async function sendCode() {
    if (!registerForm.email) {
      setErrorMsg('请先输入邮箱');
      return;
    }
    setSendingCode(true);
    setErrorMsg('');
    try {
      await api.post('/auth/send-code', {
        email: registerForm.email,
        type: 'register',
      });
      setCodeSent(true);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setErrorMsg('');
    try {
      await api.post('/auth/register', registerForm);
      alert('注册成功，请等待管理员分配权限后登录');
      setShowRegister(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || '注册失败');
    } finally {
      setRegistering(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const { data } = await api.post('/auth/login', form);
      if (data.code === 1) {
        // 登录态由服务端 Set-Cookie（httpOnly）写入，前端只拉取用户信息
        const { data: meData } = await api.get('/auth/me');
        if (meData.code === 1) {
          setUser(meData.data);
        }
        navigate('/dashboard');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="w-full max-w-md px-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">X Answerer Service</h1>
          <p className="text-muted-foreground mt-2">X Answerer Service Management</p>
        </div>

        {/* 登录表单 */}
        <Card className="rounded-2xl">
          <CardContent>
            <h2 className="text-xl font-semibold mb-6">登录</h2>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">邮箱</Label>
                <Input
                  id="login-email"
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">密码</Label>
                <Input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                还没有账号？
                <a
                  className="text-foreground font-medium hover:underline cursor-pointer"
                  onClick={() => setShowRegister(true)}
                >
                  注册
                </a>
              </p>
            </div>

            {/* 错误提示 */}
            {errorMsg && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {errorMsg}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 注册表单 */}
        {showRegister && (
          <Card className="rounded-2xl mt-6">
            <CardContent>
              <h2 className="text-xl font-semibold mb-2">注册</h2>
              <p className="text-sm text-muted-foreground mb-6">
                注册后请联系管理员分配权限
              </p>

              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="register-email">邮箱</Label>
                  <Input
                    id="register-email"
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={registerForm.email}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, email: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-code">验证码</Label>
                  <div className="flex gap-2">
                    <Input
                      id="register-code"
                      type="text"
                      required
                      placeholder="请输入验证码"
                      className="flex-1"
                      value={registerForm.code}
                      onChange={(e) =>
                        setRegisterForm({ ...registerForm, code: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={sendingCode}
                      onClick={sendCode}
                      className="whitespace-nowrap"
                    >
                      {sendingCode ? '发送中' : codeSent ? '已发送' : '获取验证码'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="register-password">密码</Label>
                  <Input
                    id="register-password"
                    type="password"
                    required
                    minLength={6}
                    placeholder="至少 6 位密码"
                    value={registerForm.password}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, password: e.target.value })
                    }
                  />
                </div>

                <Button type="submit" disabled={registering} className="w-full">
                  {registering ? '注册中...' : '注册'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  已有账号？
                  <a
                    className="text-foreground font-medium hover:underline cursor-pointer"
                    onClick={() => setShowRegister(false)}
                  >
                    返回登录
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
