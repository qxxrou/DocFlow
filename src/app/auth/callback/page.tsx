'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

import authApi from '@/services/auth';
import { saveAuthData } from '@/utils/cookie';

function CallbackContent() {
  const [status, setStatus] = useState('处理中...');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // 确保组件在客户端挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取原始跳转页面
  const getRedirectUrl = () => {
    // 优先从state参数获取（GitHub OAuth标准做法）
    const state = searchParams?.get('state');

    if (state) {
      try {
        return decodeURIComponent(state);
      } catch {
        // 解析失败时忽略state参数
      }
    }

    // 其次从URL参数获取
    const redirectTo = searchParams?.get('redirect_to') || searchParams?.get('returnTo');

    if (redirectTo) {
      return decodeURIComponent(redirectTo);
    }

    // 最后从sessionStorage获取（仅在客户端）
    if (mounted && typeof window !== 'undefined') {
      try {
        const savedRedirect = sessionStorage.getItem('auth_redirect');

        if (savedRedirect) {
          sessionStorage.removeItem('auth_redirect'); // 使用后清除

          return savedRedirect;
        }
      } catch (error) {
        // 静默处理sessionStorage错误
        console.warn('Failed to access sessionStorage:', error);
      }
    }

    // 默认跳转到首页
    return '/';
  };

  // 统一处理认证成功逻辑
  const handleAuthSuccess = async (authData: any) => {
    saveAuthData(authData);
    setStatus('登录成功! 正在获取用户资料...');
    setState('success');

    try {
      // 使用 getCurrentUser 接口获取用户资料
      const { data: userResponse } = await authApi.getCurrentUser({
        onError: (error) => {
          console.error('获取用户资料失败:', error);
          setStatus('获取用户资料失败，但登录成功');
        },
        unauthorized: () => {
          setStatus('用户认证失败');
          setState('error');
        },
      });

      if (userResponse?.data && typeof window !== 'undefined') {
        console.log('User profile loaded:', userResponse.data);
        localStorage.setItem('user_profile', JSON.stringify(userResponse.data));
        setStatus('登录成功! 正在跳转...');
      }
    } catch (error) {
      console.warn('Error processing user profile:', error);
      setStatus('获取用户资料失败，但登录成功');
    }

    // 跳转到原来的页面
    const redirectUrl = getRedirectUrl();
    setTimeout(() => router.push(redirectUrl), 1000);
  };

  useEffect(() => {
    // 只有在客户端挂载后才执行认证处理
    if (!mounted) return;

    const processAuth = async () => {
      try {
        // 检查searchParams是否存在
        if (!searchParams) {
          setStatus('URL参数获取失败');
          setState('error');

          return;
        }

        // 尝试从URL参数中获取token
        const token = searchParams.get('token');

        // 如果URL中直接包含token
        if (token) {
          const authData = {
            token,
            refresh_token: searchParams.get('refresh_token') || undefined,
            expires_in: searchParams.get('expires_in')
              ? parseInt(searchParams.get('expires_in')!)
              : undefined,
            refresh_expires_in: searchParams.get('refresh_expires_in')
              ? parseInt(searchParams.get('refresh_expires_in')!)
              : undefined,
            success: true,
          };

          await handleAuthSuccess(authData);

          return;
        }

        // 否则尝试使用code获取token
        const code = searchParams.get('code');

        if (!code) {
          setStatus('未收到授权码或Token，请重新尝试登录');
          setState('error');

          return;
        }

        setStatus('正在与GitHub服务器通信...');

        const { data, error } = await authApi.githubCallback(code, {
          onError: (error) => {
            // 处理不同类型的错误
            if (error instanceof Error) {
              if (error.message.includes('超时') || error.message.includes('timeout')) {
                setStatus('GitHub认证超时，请重试或检查网络连接');
              } else if (error.message.includes('网络')) {
                setStatus('网络连接错误，请检查您的网络设置');
              } else {
                setStatus(`认证失败: ${error.message}`);
              }
            }
          },
        });

        if (error) {
          setStatus(`登录失败: ${error}`);
          setState('error');

          return;
        }

        // 从API响应中获取实际的数据
        if (data && data.code === 200) {
          await handleAuthSuccess(data.data);
        } else {
          setStatus(`登录失败: ${data?.message || '未知错误'}`);
          setState('error');
        }
      } catch (e) {
        if (e instanceof Error) {
          if (e.message.includes('Failed to fetch') || e.message.includes('Network')) {
            setStatus('网络连接失败，请检查网络设置后重试');
          } else if (e.message.includes('timeout') || e.message.includes('超时')) {
            setStatus('请求超时，服务器响应较慢，请重试');
          } else {
            setStatus(`认证失败: ${e.message}`);
          }
        } else {
          setStatus('登录过程中发生未知错误，请重试');
        }

        setState('error');
      }
    };

    processAuth();
  }, [searchParams, router, mounted]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-100 bg-white p-10 shadow-xl">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">GitHub认证</h1>

          <div className="mt-6 flex flex-col items-center justify-center space-y-4">
            {state === 'loading' && (
              <div className="flex flex-col items-center">
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-500" />
                <p className="text-lg font-medium text-gray-700">{status}</p>
              </div>
            )}

            {state === 'success' && (
              <div className="flex flex-col items-center">
                <CheckCircle className="mb-4 h-14 w-14 text-green-500" />
                <p className="text-lg font-medium text-gray-700">{status}</p>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center">
                <AlertCircle className="mb-4 h-14 w-14 text-red-500" />
                <p className="mb-4 text-center text-lg font-medium text-gray-700">{status}</p>
                <div className="flex space-x-3">
                  <button
                    className="rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
                    onClick={() => {
                      setState('loading');
                      setStatus('重新尝试认证...');
                      // 重新触发认证流程
                      window.location.reload();
                    }}
                  >
                    重试
                  </button>
                  <button
                    className="rounded-lg bg-gray-500 px-4 py-2 text-white transition-colors hover:bg-gray-600"
                    onClick={() => router.push('/auth')}
                  >
                    返回登录
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-100 bg-white p-10 shadow-xl">
            <div className="text-center">
              <h1 className="mb-2 text-2xl font-bold text-gray-800">GitHub认证</h1>
              <div className="mt-6 flex flex-col items-center justify-center">
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-500" />
                <p className="text-lg font-medium text-gray-700">加载中...</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
