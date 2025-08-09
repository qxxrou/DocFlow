'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import authApi from '@/services/auth';
import { saveAuthData } from '@/utils/cookie';
import { ErrorHandler } from '@/services/request';

// 验证码长度配置
const CODE_LENGTH = 6;

// 表单验证 schema
const emailLoginSchema = z.object({
  email: z.string().min(1, '请输入邮箱地址').email('请输入有效的邮箱地址').max(100, '邮箱地址过长'),
  code: z
    .string()
    .min(1, '请输入验证码')
    .length(CODE_LENGTH, `验证码必须是${CODE_LENGTH}位数字`)
    .regex(/^\d+$/, '验证码只能包含数字'),
});

type EmailLoginFormData = z.infer<typeof emailLoginSchema>;

export default function EmailLoginPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // 使用 ref 保存定时器 ID，避免内存泄漏
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 使用 react-hook-form + zod
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
    trigger,
    setValue,
  } = useForm<EmailLoginFormData>({
    resolver: zodResolver(emailLoginSchema),
    mode: 'onChange',
    defaultValues: {
      email: '',
      code: '',
    },
  });

  const watchedEmail = watch('email');

  // 清理定时器的函数
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const errorHandler: ErrorHandler = {
    onError: (error) => {
      console.error('请求错误:', error);
      toast.error('请求失败，请稍后重试');
    },

    forbidden: () => {
      toast.error('验证码错误或已失效');
    },
    serverError: () => {
      toast.error('服务器错误，请稍后再试');
    },
    networkError: () => {
      toast.error('网络连接失败，请检查网络');
    },
    default: () => {
      toast.error('未知错误');
    },
  };

  // 开始倒计时
  const startCountdown = useCallback(() => {
    clearTimer(); // 清理之前的定时器
    setCountdown(60);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer();

          return 0;
        }

        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  // 发送验证码
  const handleSendCode = async () => {
    // 先验证邮箱字段
    const emailValid = await trigger('email');

    if (!emailValid || !watchedEmail) {
      return;
    }

    // 防止重复提交
    if (isSendingCode || countdown > 0) {
      return;
    }

    setIsSendingCode(true);

    const { data, error } = await authApi.sendEmailCode(watchedEmail, errorHandler);

    if (error) {
      console.error('发送验证码失败:', error);
      setIsSendingCode(false);

      return;
    }

    if (data && data.code === 201) {
      toast.success('验证码已发送', {
        description: `验证码已发送到 ${watchedEmail}，请查收`,
      });
      startCountdown();
    } else {
      toast.error(data?.message || '发送验证码失败');
    }

    setIsSendingCode(false);
  };

  // 处理登录提交
  const onSubmit = async (data: EmailLoginFormData) => {
    // 防止重复提交
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    console.log('开始登录请求:', { email: data.email, code: data.code });

    const { data: responseData, error } = await authApi.emailCodeLogin(
      { email: data.email, code: data.code },
      errorHandler,
    );

    console.log('登录响应:', { responseData, error });

    if (error) {
      console.error('登录失败:', error);
      setIsSubmitting(false);

      return;
    }

    if (responseData && responseData.code === 201) {
      toast.success('登录成功！', {
        description: '正在获取用户资料...',
      });

      saveAuthData(responseData.data);

      try {
        // 使用 getCurrentUser 接口获取用户资料
        const { data: userResponse } = await authApi.getCurrentUser({
          onError: (error) => {
            console.error('获取用户资料失败:', error);
            toast.error('获取用户资料失败，但登录成功');
          },
          unauthorized: () => {
            toast.error('用户认证失败');

            return;
          },
        });

        if (userResponse?.data && typeof window !== 'undefined') {
          console.log('User profile loaded:', userResponse.data);
          localStorage.setItem('user_profile', JSON.stringify(userResponse.data));
        }
      } catch (error) {
        console.warn('Error processing user profile:', error);
        toast.error('获取用户资料失败，但登录成功');
      }

      // 清理定时器和状态
      clearTimer();

      // 延迟跳转，让用户看到成功消息
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } else {
      console.error('登录响应异常:', responseData);
      toast.error(responseData?.message || '登录失败，请检查验证码是否正确');
    }

    setIsSubmitting(false);
  };

  // 处理验证码输入变化（只允许数字）
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setValue('code', value, { shouldValidate: true });
  };

  // 检查发送验证码按钮是否应该禁用
  const isSendCodeDisabled = !watchedEmail || !!errors.email || isSendingCode || countdown > 0;

  // 检查登录按钮是否应该禁用
  const isLoginDisabled = !isValid || isSubmitting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-gray-100 bg-white p-10 shadow-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800">邮箱验证码登录</h1>
          <p className="mt-3 text-gray-600">请输入您的邮箱和验证码</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱地址</Label>
            <Input
              id="email"
              type="email"
              placeholder="请输入邮箱地址"
              {...register('email')}
              className={
                errors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
              }
              autoComplete="email"
            />
            {errors.email && (
              <div className="flex items-center space-x-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.email.message}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">验证码</Label>
            <div className="flex space-x-2">
              <Input
                id="code"
                type="text"
                placeholder={`请输入${CODE_LENGTH}位验证码`}
                {...register('code')}
                onChange={handleCodeChange}
                className={
                  errors.code ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
                }
                maxLength={CODE_LENGTH}
                autoComplete="one-time-code"
              />
              <Button
                type="button"
                variant="outline"
                className="min-w-[100px] whitespace-nowrap"
                onClick={handleSendCode}
                disabled={isSendCodeDisabled}
              >
                {countdown > 0 ? `${countdown}s` : isSendingCode ? '发送中...' : '获取验证码'}
              </Button>
            </div>
            {errors.code && (
              <div className="flex items-center space-x-1 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.code.message}</span>
              </div>
            )}
            {countdown > 0 && !errors.code && (
              <div className="flex items-center space-x-1 text-sm text-blue-600">
                <CheckCircle className="h-4 w-4" />
                <span>验证码已发送，{countdown}秒后可重新发送</span>
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="flex w-full transform items-center justify-center space-x-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-4 text-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:from-blue-600 hover:to-indigo-600 disabled:transform-none disabled:opacity-50"
            disabled={isLoginDisabled}
          >
            <Mail className="mr-2 h-5 w-5" />
            <span className="text-base">{isSubmitting ? '登录中...' : '登录'}</span>
          </Button>
        </form>

        <div className="text-center">
          <Button
            variant="link"
            className="text-gray-500 hover:text-gray-700"
            onClick={() => router.push('/auth')}
            disabled={isSubmitting}
          >
            返回登录页
          </Button>
        </div>

        <div className="mt-10 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} 文档系统. 保留所有权利.</p>
        </div>
      </div>
    </div>
  );
}
