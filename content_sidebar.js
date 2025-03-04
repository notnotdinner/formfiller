// 侧边栏注入脚本
console.log('正在注入表单填写助手侧边栏...');

// 跟踪侧边栏状态和元素
let sidebarVisible = false;
let sidebarContainer = null;
let toggleButton = null;

// 创建侧边栏容器
function createSidebar() {
  // 删除任何已存在的侧边栏
  const existingSidebar = document.getElementById('form-filler-sidebar-container');
  if (existingSidebar) {
    document.body.removeChild(existingSidebar);
  }

  // 创建主容器
  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'form-filler-sidebar-container';
  
  // 设置样式 - 初始状态为隐藏
  sidebarContainer.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 600px;
    height: 100vh;
    background-color: white;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
    z-index: 2147483647;
    font-family: Arial, sans-serif;
    display: block;
    border-left: 1px solid #ddd;
    overflow: hidden;
    transform: translateX(100%); /* 初始隐藏 */
    transition: transform 0.3s ease;
  `;

  // 创建iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'form-filler-sidebar-iframe';
  iframe.src = chrome.runtime.getURL('popup.html?sidebar=true');
  
  // 设置iframe样式
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    overflow: hidden;
    background-color: white;
  `;

  // 创建拖动条
  const dragHandle = document.createElement('div');
  dragHandle.id = 'form-filler-sidebar-drag';
  dragHandle.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 10px;
    height: 100%;
    cursor: ew-resize;
    background-color: transparent;
  `;

  // 创建关闭/收起按钮
  toggleButton = document.createElement('button');
  toggleButton.id = 'form-filler-sidebar-toggle';
  toggleButton.innerText = '>>';  // 初始为隐藏状态
  toggleButton.style.cssText = `
    position: fixed;
    top: 10px;
    right: 0;
    background-color: #1a73e8;
    color: white;
    border: none;
    border-radius: 4px 0 0 4px;
    padding: 8px;
    cursor: pointer;
    z-index: 2147483647;
    opacity: 0.8;
    transition: right 0.3s ease;
  `;

  // 添加拖动功能
  let startX, startWidth;
  dragHandle.addEventListener('mousedown', function(e) {
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(sidebarContainer).width, 10);
    document.addEventListener('mousemove', dragResize);
    document.addEventListener('mouseup', stopResize);
  });

  function dragResize(e) {
    const width = startWidth - (e.clientX - startX);
    if (width > 400 && width < 1000) {
      sidebarContainer.style.width = width + 'px';
    }
  }

  function stopResize() {
    document.removeEventListener('mousemove', dragResize);
    document.removeEventListener('mouseup', stopResize);
  }

  // 切换侧边栏可见性
  toggleButton.addEventListener('click', function() {
    toggleSidebar();
  });

  // 添加元素到页面
  sidebarContainer.appendChild(iframe);
  sidebarContainer.appendChild(dragHandle);
  document.body.appendChild(sidebarContainer);
  document.body.appendChild(toggleButton);

  console.log('表单填写助手侧边栏已注入，初始状态：隐藏');
  return { iframe, sidebarContainer, toggleButton };
}

// 切换侧边栏的显示/隐藏
function toggleSidebar(forceState) {
  if (sidebarContainer === null) {
    createSidebar();
  }
  
  // 如果提供了强制状态，则使用它；否则切换当前状态
  if (forceState !== undefined) {
    sidebarVisible = forceState;
  } else {
    sidebarVisible = !sidebarVisible;
  }
  
  if (sidebarVisible) {
    // 显示侧边栏
    sidebarContainer.style.transform = 'translateX(0)';
    toggleButton.innerText = '<<';
    toggleButton.style.right = '600px';  // 根据侧边栏宽度调整
  } else {
    // 隐藏侧边栏
    sidebarContainer.style.transform = 'translateX(100%)';
    toggleButton.innerText = '>>';
    toggleButton.style.right = '0';
  }
  
  console.log('侧边栏状态已切换为:', sidebarVisible ? '显示' : '隐藏');
}

// 在页面加载完成后注入侧边栏
window.addEventListener('load', function() {
  createSidebar();
  // 初始状态为隐藏，不显示
});

// 如果页面已加载完成，立即注入
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  createSidebar();
}

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('侧边栏收到消息:', message);
  
  if (message.action === 'toggleSidebar') {
    toggleSidebar(message.visible);
    sendResponse({success: true, visible: sidebarVisible});
    return true;
  }
  
  return false;
});

// 监听来自iframe的消息
window.addEventListener('message', function(event) {
  const iframe = document.getElementById('form-filler-sidebar-iframe');
  if (!iframe || event.source !== iframe.contentWindow) {
    return;
  }

  const message = event.data;
  if (message && message.type === 'getFormFields') {
    // 尝试使用chrome.runtime.sendMessage
    try {
      chrome.runtime.sendMessage({action: 'getFormFields'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('获取表单字段失败:', chrome.runtime.lastError);
          return;
        }
        
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: 'formFieldsResponse',
            success: response && response.success,
            fields: response && response.fields,
            error: response && response.error || '未知错误'
          }, '*');
        }
      });
    } catch (error) {
      console.error('发送消息时出错:', error);
    }
  }
});

// 注入自定义样式以确保侧边栏显示正确
function injectCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #form-filler-sidebar-container {
      transition: transform 0.3s ease;
    }
    #form-filler-sidebar-toggle {
      transition: right 0.3s ease;
    }
  `;
  document.head.appendChild(style);
}

injectCustomStyles(); 