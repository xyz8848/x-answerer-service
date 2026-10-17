import { useEffect, useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import api from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 构造 OCSJS 自定义题库配置（URL 跟随当前访问域名；仅客户端可用 window）。
 * token 为当前用户的 API Key，搜题接口据此鉴权。
 */
function buildWrapperConfig(apiKey: string): string {
  const apiUrl = `${window.location.origin}/api/v1/questions/search/ocsjs`;
  const config = {
    name: 'X Answerer Service',
    homepage: window.location.origin,
    url: apiUrl,
    method: 'post',
    type: 'GM_xmlhttpRequest',
    contentType: 'json',
    headers: {},
    data: {
      token: apiKey,
      title: '${title}',
      options: '${options}',
      type: '${type}',
    },
    handler:
      'return (res)=> res.code === 1 ? [res.data.title, res.data.answer] : undefined',
  };
  return JSON.stringify(config, null, 2);
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

export default function Home() {
  // window 仅在客户端存在，SSR 期间留空，挂载后再生成配置
  const [apiKey, setApiKey] = useState('');
  const [config, setConfig] = useState('');
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    // 取当前用户的第一个 API Key 用于生成配置；没有则提示先创建
    api
      .get('/keys')
      .then(({ data }) => {
        if (data.code === 1 && data.data.items.length > 0) {
          setApiKey(data.data.items[0].key);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setConfig(buildWrapperConfig(apiKey || '请先在「API 密钥」页创建'));
  }, [apiKey]);

  async function handleCopy() {
    const ok = await copyText(config);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert('复制失败，请手动选择文本复制');
    }
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-8">题库配置</h2>

      <Card className="max-w-3xl">
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">OCSJS 自定义题库</h3>
              <p className="text-sm text-muted-foreground mt-1">
                生成 OCSJS 网课助手所需的题库配置 JSON，接口地址与你的 API Key 自动填入
                {!apiKey && (
                  <span className="text-destructive">（尚未创建 API Key，请先到「API 密钥」页创建）</span>
                )}
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Eye className="size-4" />
              查看
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>OCSJS 题库配置</DialogTitle>
            <DialogDescription>
              在 OCSJS 网课助手 设置 → 题库配置 → 自定义题库 中粘贴以下 JSON
            </DialogDescription>
          </DialogHeader>

          <pre className="bg-muted rounded-lg p-4 text-sm leading-6 overflow-x-auto max-h-[50vh] overflow-y-auto font-mono">
            {config}
          </pre>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              关闭
            </Button>
            <Button onClick={handleCopy} className="gap-2">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? '已复制' : '复制配置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
