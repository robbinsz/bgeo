import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
}

const ROUTE_META: Record<string, { title: string; description: string; keywords?: string }> = {
  '/overview': {
    title: '总览大盘 · Bgeo 企业级 GEO 自主运营平台',
    description: 'Bgeo (bgeo.cc) GEO 核心指标驾驶舱：全网综合可见度、声量健康度、AI 引擎多维对比、待办任务与闭环运行状态。',
    keywords: 'Bgeo, bgeo.cc, GEO, 生成式引擎优化, AI搜索声量, 可见度大盘',
  },
  '/monitor': {
    title: '实时监测中心 · Bgeo (bgeo.cc)',
    description: '深度监测 ChatGPT、DeepSeek、豆包、Kimi、Perplexity 等主流大模型对核心业务问题的引用与排名。',
    keywords: 'Bgeo, bgeo.cc, 大模型监测, AI排名, 引用分析, 多模型拨测',
  },
  '/diagnosis': {
    title: '机会与差距诊断 · Bgeo (bgeo.cc)',
    description: '自动归因模型回答失分点，发现高价值机会问题、事实凭据缺失与竞品推荐劣势，并提供可执行优化建议。',
    keywords: 'Bgeo, bgeo.cc, 差距诊断, 机会挖掘, AI归因分析, 竞品矩阵',
  },
  '/strategy': {
    title: '策略编排与规则库 · Bgeo (bgeo.cc)',
    description: '可视化编排 GEO 决策树、配置大模型检索事实凭据规则、设定内容分发与品牌守门人标准。',
    keywords: 'Bgeo, bgeo.cc, 策略编排, 规则引擎, 事实规则, 策略自动化',
  },
  '/content': {
    title: '内容工厂与语料生产 · Bgeo (bgeo.cc)',
    description: '针对 AI 检索引用率优化内容结构，生成符合 Schema 结构与大模型偏好的高可信品牌语料。',
    keywords: 'Bgeo, bgeo.cc, 内容工厂, 结构化语料, 引用率优化, 事实核验',
  },
  '/publish': {
    title: '发布与渠道分发 · Bgeo (bgeo.cc)',
    description: '一键将优质 GEO 资产推送到官网、权威媒体、问答知识库及搜索引擎爬虫高频访问通道。',
    keywords: 'Bgeo, bgeo.cc, 渠道分发, 知识库发布, 权威反向链接, SEO分发',
  },
  '/experiments': {
    title: '对照实验中心 · Bgeo (bgeo.cc)',
    description: '多版本提示词、不同凭据载体与竞品话术的 AB 对照实验，量化模型引用提升效果。',
    keywords: 'Bgeo, bgeo.cc, AB实验, GEO测试, 引用对照, 效果归因',
  },
  '/evolution': {
    title: '自进化治理中心 · Bgeo (bgeo.cc)',
    description: '基于真实拨测反馈自进化规则与策略，自动沉淀高胜率 Prompt，驱动品牌 GEO 长期自主进化。',
    keywords: 'Bgeo, bgeo.cc, 自进化, 规则反哺, 闭环自优化, 自动化运营',
  },
  '/sources': {
    title: '数据源管理 · Bgeo (bgeo.cc)',
    description: '统一管理多渠道语料库、官网页面、评测数据与外部第三方权威信源接入。',
    keywords: 'Bgeo, bgeo.cc, 数据源, 外部信源, 知识库接入',
  },
  '/settings': {
    title: '系统设置与安全边界 · Bgeo (bgeo.cc)',
    description: '配置自动化执行级别 (L0~L3)、安全合规阈值与品牌风控边界。',
    keywords: 'Bgeo, bgeo.cc, 系统设置, L2自动化, 风控规则, 治理',
  },
  '/login': {
    title: '账号登录 · Bgeo (bgeo.cc)',
    description: '登录 Bgeo 企业级 GEO 自主运营平台，开启全生命周期 AI 搜索可见度提升。',
    keywords: 'Bgeo, bgeo.cc, 登录, 双Token鉴权',
  },
};

export const SEO: React.FC<SEOProps> = ({ title, description, keywords }) => {
  const location = useLocation();

  useEffect(() => {
    const meta = ROUTE_META[location.pathname] || {
      title: 'Bgeo · 企业级 GEO 自主运营平台 (bgeo.cc)',
      description: 'Bgeo (bgeo.cc) 企业级 GEO 生成式搜索优化自主运营平台：持续监测、诊断、实施、复测并沉淀有效策略，形成可控的自进化闭环。',
      keywords: 'Bgeo, bgeo.cc, GEO, 生成式引擎优化, 自主运营平台',
    };

    const finalTitle = title || meta.title;
    const finalDesc = description || meta.description;
    const finalKeywords = keywords || meta.keywords;

    // Update document title
    document.title = finalTitle;

    // Update meta description
    let descMeta = document.querySelector('meta[name="description"]');
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.setAttribute('name', 'description');
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', finalDesc);

    // Update meta keywords
    let kwMeta = document.querySelector('meta[name="keywords"]');
    if (!kwMeta) {
      kwMeta = document.createElement('meta');
      kwMeta.setAttribute('name', 'keywords');
      document.head.appendChild(kwMeta);
    }
    if (finalKeywords) {
      kwMeta.setAttribute('content', finalKeywords);
    }

    // Update canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `https://bgeo.cc${location.pathname === '/' ? '/overview' : location.pathname}`);
  }, [location.pathname, title, description, keywords]);

  return null;
};
