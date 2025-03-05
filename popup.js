console.log('popup.js 加载中...');

// 判断当前是否为侧边栏模式
const isSidebarMode = window.location.search.includes('sidebar=true') || 
                      (window.parent !== window);

// 设置全局变量用于通信                    
window.formFillerSidebar = {
  mode: isSidebarMode ? 'sidebar' : 'popup',
  ready: false
};

document.addEventListener('DOMContentLoaded', function() {
  console.log('[初始化] ===== 扩展弹出窗口加载 =====');
  console.log('当前模式:', isSidebarMode ? '侧边栏模式' : 'Popup模式');
  
  // 设置文档标题以便调试
  if (isSidebarMode) {
    document.title = '表单填写助手 - 侧边栏模式';
    document.documentElement.classList.add('sidebar-mode');
  } else {
    document.documentElement.classList.add('popup-mode');
  }
  
  // 在侧边栏模式下监听来自父窗口的消息
  if (isSidebarMode) {
    window.addEventListener('message', function(event) {
      // 确保消息来源安全 - 在侧边栏模式下是父窗口
      if (event.source !== window.parent) {
        console.log('忽略非父窗口消息');
        return;
      }
      
      console.log('收到父窗口消息:', event.data);
      const message = event.data;
      
      if (message && message.type === 'formFieldsResponse') {
        // 处理获取到的表单字段数据
        console.log('收到表单字段数据:', message);
        if (message.success) {
          displayFormFields(message.fields);
        } else {
          console.error('获取表单字段失败:', message.error);
          updateStatus('获取表单字段失败: ' + (message.error || '未知错误'), 'error');
        }
      }
    });
    
    // 通知父窗口侧边栏已准备好
    setTimeout(function() {
      try {
        window.formFillerSidebar.ready = true;
        window.parent.postMessage({
          type: 'sidebarReady',
          from: 'formFiller'
        }, '*');
        console.log('已通知父窗口侧边栏准备就绪');
      } catch (error) {
        console.error('无法通知父窗口:', error);
      }
    }, 500);
  }
  
  // 获取DOM元素
  const textInput = document.getElementById('textInput');
  const extractButton = document.getElementById('extractButton');
  const fillButton = document.getElementById('fillButton');
  const extractResult = document.getElementById('extractResult');
  const statusMessage = document.getElementById('statusMessage');
  
  // 存储提取的表单数据
  let extractedData = null;
  
  // 登录功能相关元素
  const loginButton = document.getElementById('loginButton');
  const loginModal = document.getElementById('loginModal');
  const closeButton = document.querySelector('.close-button');
  const submitLogin = document.getElementById('submitLogin');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginMessage = document.getElementById('loginMessage');
  const loginStatus = document.getElementById('loginStatus');
  
  // 存储当前页面的input元素数据
  let currentInputElements = [];
  
  // 初始化扩展状态
  chrome.storage.local.get(['lastText', 'lastExtractedData'], function(result) {
    if (result.lastText) {
      textInput.value = result.lastText;
    }
    
    if (result.lastExtractedData) {
      extractedData = result.lastExtractedData;
      displayExtractedData(extractedData);
      fillButton.disabled = false;
    }
  });
  
  // 添加消息监听器，响应content.js的请求
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[popup] 收到消息:', request);
    
    // 处理获取textInput内容的请求
    if (request.action === 'getTextInputContent') {
      try {
        const textInput = document.getElementById('textInput');
        const content = textInput ? textInput.value.trim() : '';
        
        console.log('[popup] 发送textInput内容:', content);
        sendResponse({
          success: true,
          content: content
        });
      } catch (error) {
        console.error('[popup] 获取textInput内容时出错:', error);
        sendResponse({
          success: false,
          error: error.toString()
        });
      }
      return true; // 保持消息通道开放以进行异步响应
    }
    
    // 处理显示登录提示的请求
    if (request.action === 'showLoginRequired') {
      console.log('[popup] 收到显示登录提示的请求');
      updateStatus(request.message || '请先登录后再使用此功能', 'error');
      
      // 如果存在登录按钮，突出显示它
      const loginButton = document.getElementById('loginButton');
      if (loginButton) {
        loginButton.classList.add('highlight');
        // 5秒后移除高亮
        setTimeout(() => {
          loginButton.classList.remove('highlight');
        }, 5000);
      }
      
      return true;
    }
  });
  
  // 检查登录状态
  checkLoginStatus();
  
  // 绑定提取按钮事件
  extractButton.addEventListener('click', function() {
    const text = textInput.value.trim();
    
    if (!text) {
      updateStatus('请输入包含个人信息的文本', 'error');
      return;
    }

    // 显示正在处理的状态
    updateStatus('正在分析页面表单和文本...', '');
    extractResult.innerHTML = '<p class="placeholder">处理中，请稍候...</p>';
    
    if (isSidebarMode) {
      // 在侧边栏模式下，直接向父窗口请求表单字段
      try {
        window.parent.postMessage({
          type: 'getFormFields',
          from: 'formFiller'
        }, '*');
        console.log('已向父窗口请求表单字段');
      } catch (error) {
        console.error('请求表单字段失败:', error);
        updateStatus('无法与页面通信，请刷新页面重试', 'error');
      }
      
      // 异步调用后台脚本进行提取
      chrome.runtime.sendMessage(
        { action: 'extractFields', text: text },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('连接后台脚本失败:', chrome.runtime.lastError.message);
            updateStatus('无法连接到后台服务，请刷新扩展', 'error');
            return;
          }
          
          if (response && response.success) {
            processExtractedData(response.data, text);
          } else {
            extractResult.innerHTML = '<p class="placeholder">提取失败，请重试</p>';
            updateStatus(response?.error || '提取失败，请重试', 'error');
            fillButton.disabled = true;
          }
        }
      );
      
      return;
    }
    
    // 对于popup模式，使用原来的逻辑
    // 获取当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) {
        updateStatus('无法访问当前页面', 'error');
        return;
      }

      console.log('当前页面:', tabs[0].url);
      
      // 先获取当前页面的表单字段
      try {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          files: ['content.js']
        }, function() {
          // 脚本注入后再发送消息
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getFormFields' }, function(response) {
            // 检查runtime.lastError
            if (chrome.runtime.lastError) {
              console.error('连接内容脚本失败:', chrome.runtime.lastError.message);
              // 如果无法获取表单，使用普通提取
              extractWithoutFormFields(text);
              return;
            }
            
            if (!response || !response.success) {
              console.error('获取表单字段失败:', response?.error || '未知错误');
              // 如果无法获取表单，仍使用普通提取
              extractWithoutFormFields(text);
              return;
            }
            
            const formFields = response.fields;
            console.log('获取到的表单字段:', formFields);
            
            // 实时展示获取到的表单字段
            displayFormFields(formFields);
            
            // 调用后台脚本进行基于表单的文本分析
            chrome.runtime.sendMessage(
              { 
                action: 'extractFieldsByLabels', 
                text: text,
                formFields: formFields 
              },
              function(response) {
                // 检查runtime.lastError
                if (chrome.runtime.lastError) {
                  console.error('连接后台脚本失败:', chrome.runtime.lastError.message);
                  extractWithoutFormFields(text);
                  return;
                }
                
                if (response && response.success) {
                  extractedData = response.data;
                  
                  // 保存到本地存储
                  chrome.storage.local.set({
                    lastText: text,
                    lastExtractedData: extractedData
                  });
                  
                  // 显示提取结果
                  displayExtractedData(extractedData);
                  
                  // 启用填写按钮
                  fillButton.disabled = false;
                  
                  updateStatus('信息提取成功！', 'success');
                } else {
                  extractResult.innerHTML = '<p class="placeholder">提取失败，请重试</p>';
                  updateStatus(response?.error || '提取失败，请重试', 'error');
                  fillButton.disabled = true;
                }
              }
            );
          });
        });
      } catch (error) {
        console.error('发送消息时出错:', error);
        extractWithoutFormFields(text);
      }
    });
  });
  
  // 使用常规方法提取字段（不使用表单字段）
  function extractWithoutFormFields(text) {
    // 调用后台脚本进行文本分析
    chrome.runtime.sendMessage(
      { action: 'extractFields', text: text },
      function(response) {
        if (response.success) {
          extractedData = response.data;
          
          // 保存到本地存储
          chrome.storage.local.set({
            lastText: text,
            lastExtractedData: extractedData
          });
          
          // 显示提取结果
          displayExtractedData(extractedData);
          
          // 启用填写按钮
          fillButton.disabled = false;
          
          updateStatus('信息提取成功！', 'success');
        } else {
          extractResult.innerHTML = '<p class="placeholder">提取失败，请重试</p>';
          updateStatus(response.error || '提取失败，请重试', 'error');
          fillButton.disabled = true;
        }
      }
    );
  }
  
  // 绑定填写按钮事件
  fillButton.addEventListener('click', function() {
    if (!extractedData) {
      updateStatus('请先提取信息', 'error');
      return;
    }
    
    // 获取当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) {
        updateStatus('无法访问当前页面', 'error');
        return;
      }
      
      // 向内容脚本发送填写命令
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'fillForm', data: extractedData },
        function(response) {
          if (response && response.success) {
            updateStatus('表单填写成功！', 'success');
          } else {
            updateStatus(response?.error || '表单填写失败', 'error');
          }
        }
      );
    });
  });
  
  // 辅助函数：显示提取的数据
  function displayExtractedData(data) {
    if (!data || Object.keys(data).length === 0) {
      extractResult.innerHTML = '<p class="placeholder">未能提取到有效信息</p>';
      return;
    }
    
    let html = '';
    for (const [key, value] of Object.entries(data)) {
      html += `
        <div class="field-item">
          <span class="field-name">${key}:</span>
          <span class="field-value">${value}</span>
        </div>
      `;
    }
    
    extractResult.innerHTML = html;
  }
  
  // 辅助函数：更新状态消息
  function updateStatus(message, type = 'info') {
    console.log('[popup] 状态更新:', message, '(类型:', type, ')');
    
    const statusElement = document.getElementById('statusMessage');
    if (!statusElement) {
      console.error('[popup] 状态元素未找到!');
      return;
    }
    
    let color = 'black';
    switch (type) {
      case 'success':
        color = 'green';
        break;
      case 'error':
        color = 'red';
        break;
      case 'warning':
        color = 'orange';
        break;
      case 'info':
      default:
        color = 'blue';
    }
    
    // 更新状态文本和样式
    statusElement.innerHTML = `<strong style="color:${color}">${message}</strong> (${new Date().toLocaleTimeString()})`;
    statusElement.className = 'status-message status-' + type;
    
    // 确保状态可见
    statusElement.style.display = 'block';
  }
  
  // 在适当位置添加新函数
  function displayFormFields(fields) {
    if (!fields || fields.length === 0) {
      return;
    }
    
    // 更新状态
    updateStatus('已发现表单字段，正在分析...', 'info');
    
    // 在提取结果区域显示找到的表单字段
    const fieldsHtml = fields.map(field => {
      return `<div class="form-field-item">
        <span class="field-label">${field.label || '未命名字段'}</span>
        <span class="field-type">(${getFieldTypeName(field.type)})</span>
      </div>`;
    }).join('');
    
    extractResult.innerHTML = `
      <div class="form-fields-container">
        <h3>找到以下表单字段：</h3>
        <div class="form-fields-list">${fieldsHtml}</div>
        <p class="processing-message">正在提取信息，请稍候...</p>
      </div>
    `;
  }
  
  // 获取字段类型的中文名称
  function getFieldTypeName(type) {
    const typeNames = {
      'text': '文本',
      'email': '电子邮件',
      'tel': '电话',
      'number': '数字',
      'date': '日期',
      'time': '时间',
      'datetime': '日期时间',
      'select': '下拉选择',
      'checkbox': '复选框',
      'radio': '单选按钮',
      'textarea': '多行文本',
      'password': '密码',
      'url': '网址',
      'file': '文件'
    };
    
    return typeNames[type] || type;
  }

  // 打开登录模态框
  loginButton.addEventListener('click', function() {
    loginModal.style.display = 'block';
  });

  // 关闭登录模态框
  closeButton.addEventListener('click', function() {
    loginModal.style.display = 'none';
    clearLoginForm();
  });

  // 点击模态框外部不关闭
  // 移除了原有的点击外部关闭功能，保证窗口始终显示
  
  // 提交登录表单
  submitLogin.addEventListener('click', function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      loginMessage.textContent = '请输入用户名和密码';
      return;
    }

    loginMessage.textContent = '登录中...';
    submitLogin.disabled = true;

    // 调用登录API
    fetch('https://a.reotrip.com/api/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('登录失败，请检查用户名和密码');
      }
      return response.json();
    })
    .then(data => {
      console.log('登录成功:', data);
      
      // 使用统一的loginState格式保存登录状态
      const loginState = {
        isLoggedIn: true,
        userIdentifier: data.username || username,
        password: password, // 需要保存密码用于认证
        lastLoginTime: Date.now(),
        token: data.token || ''
      };
      
      // 保存登录状态
      chrome.storage.local.set({ loginState }, function() {
        console.log('[popup] 登录状态已保存:', loginState);
        
        // 通知当前活动标签页的content脚本更新登录状态
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateLoginState',
              loginState: loginState
            }, function(response) {
              console.log('[popup] 通知content脚本更新登录状态:', response);
            });
          }
        });
        
        // 更新UI状态
        loginMessage.textContent = '登录成功！';
        loginMessage.style.color = '#0f9d58';
        
        // 短暂延迟后关闭模态框
        setTimeout(() => {
          loginModal.style.display = 'none';
          clearLoginForm();
          updateLoginStatusUI(true, loginState.userIdentifier);
        }, 1000);
      });
    })
    .catch(error => {
      console.error('登录错误:', error);
      loginMessage.textContent = error.message || '登录失败，请稍后再试';
      loginMessage.style.color = '#d93025';
      submitLogin.disabled = false;
    });
  });

  // 检查登录状态
  function checkLoginStatus() {
    console.log('[popup] 开始检查登录状态');
    
    // 直接从storage中读取登录状态，不依赖content.js
    chrome.storage.local.get(['loginState'], function(result) {
      console.log('[popup] 获取到storage中的登录状态:', result);
      
      if (result.loginState && result.loginState.isLoggedIn) {
        // 检查登录是否过期
        const now = Date.now();
        const lastLoginTime = result.loginState.lastLoginTime || 0;
        const expirationTime = 24 * 60 * 60 * 1000; // 24小时
        
        if (now - lastLoginTime < expirationTime) {
          console.log('[popup] 用户已登录，用户名:', result.loginState.userIdentifier);
          updateLoginStatusUI(true, result.loginState.userIdentifier);
        } else {
          console.log('[popup] 登录已过期');
          // 清除过期的登录状态
          chrome.storage.local.remove(['loginState']);
          updateLoginStatusUI(false);
        }
      } else {
        console.log('[popup] 用户未登录或登录状态无效');
        updateLoginStatusUI(false);
      }
    });
  }

  // 更新登录状态UI
  function updateLoginStatusUI(isLoggedIn, username) {
    if (isLoggedIn && username) {
      loginStatus.textContent = `已登录: ${username}`;
      loginStatus.classList.add('logged-in');
      loginButton.textContent = '退出登录';
      loginButton.onclick = function() {
        // 退出登录
        chrome.storage.local.remove(['isLoggedIn', 'username', 'token', 'loginTime'], function() {
          updateLoginStatusUI(false);
        });
      };
    } else {
      loginStatus.textContent = '';
      loginStatus.classList.remove('logged-in');
      loginButton.textContent = '登录账号';
      loginButton.onclick = function() {
        loginModal.style.display = 'block';
      };
    }
  }

  // 清空登录表单
  function clearLoginForm() {
    usernameInput.value = '';
    passwordInput.value = '';
    loginMessage.textContent = '';
    submitLogin.disabled = false;
  }

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'updateInputElements') {
      console.log('接收到input元素数据:', message.data);
      currentInputElements = message.data;
      
      // 显示input元素表格
      displayInputElementsTable(currentInputElements);
    }
  });

  // 在页面加载完成后初始化 - 移除重复的监听器
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[初始化] ===== 扩展弹出窗口加载 =====');
    
    // 首先检查登录状态
    checkLoginStatus();
    
    // 初始化按钮事件
    initButtonEvents();
    
    // 尝试直接触发刷新按钮事件
    console.log('[初始化] 尝试立即输出所有按钮');
    const allButtons = document.querySelectorAll('button');
    console.log('[初始化] 页面上的所有按钮:', Array.from(allButtons).map(b => ({
      id: b.id, 
      text: b.textContent,
      class: b.className,
      visible: b.offsetWidth > 0 && b.offsetHeight > 0,
      style: window.getComputedStyle(b).display
    })));
    
    const refreshBtn = document.getElementById('refreshButton');
    console.log('[初始化] 刷新按钮存在状态:', !!refreshBtn);
    if (refreshBtn) {
      console.log('[初始化] 刷新按钮样式:', {
        display: window.getComputedStyle(refreshBtn).display,
        visibility: window.getComputedStyle(refreshBtn).visibility,
        position: window.getComputedStyle(refreshBtn).position,
        width: refreshBtn.offsetWidth,
        height: refreshBtn.offsetHeight
      });
      
      // 尝试直接模拟点击
      console.log('[初始化] 尝试手动触发点击事件');
      setTimeout(() => {
        console.log('[初始化] 触发模拟点击');
        refreshBtn.click();
      }, 2000);
    }
    
    // 当popup打开时，向当前活动标签页请求input元素数据
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      console.log('[初始化] 查询到的当前标签页:', tabs);
      if (tabs && tabs.length > 0) {
        console.log('[初始化] 向标签页发送getInputElements消息:', tabs[0].id);
        
        // 检查权限
        chrome.permissions.getAll(function(permissions) {
          console.log('[初始化] 扩展权限:', permissions);
        });
        
        // 检查扩展信息
        console.log('[初始化] 扩展ID:', chrome.runtime.id);
        
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getInputElements'}, function(response) {
          // 如果没有收到响应，可能内容脚本还没有加载完毕，不必担心
          if (chrome.runtime.lastError) {
            console.log('[初始化] 等待内容脚本加载...错误:', chrome.runtime.lastError);
            
            // 尝试注入内容脚本
            console.log('[初始化] 尝试手动注入内容脚本');
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              files: ['content.js']
            }, function() {
              if (chrome.runtime.lastError) {
                console.error('[初始化] 注入内容脚本失败:', chrome.runtime.lastError);
              } else {
                console.log('[初始化] 内容脚本注入成功，再次尝试获取元素');
                chrome.tabs.sendMessage(tabs[0].id, {action: 'getInputElements'}, function(response) {
                  console.log('[初始化] 第二次尝试获取元素结果:', response, chrome.runtime.lastError);
                });
              }
            });
          } else {
            console.log('[初始化] 收到初始响应:', response);
          }
        });
      } else {
        console.error('[初始化] 无法获取当前标签页');
      }
    });
    
    // 添加测试按钮
    addTestButton();
  });

  // 初始化按钮事件
  function initButtonEvents() {
    const refreshButton = document.getElementById('refreshButton');
    
    if (refreshButton) {
      console.log('找到刷新按钮，准备添加点击检测');
      
      // 清除现有的事件处理器，避免冲突
      refreshButton.onclick = null;
      
      // 添加一个简单明确的点击检测
      refreshButton.addEventListener('click', function(e) {
        // 防止事件冒泡
        e.stopPropagation();
        
        console.log('刷新按钮被点击 - 检测器触发');
        
        // 显示明确的视觉反馈
        refreshButton.style.backgroundColor = 'yellow';
        setTimeout(() => {
          refreshButton.style.backgroundColor = '';
        }, 300);
        
        // 更新UI显示
        const statusMsg = document.getElementById('statusMessage');
        if (statusMsg) {
          statusMsg.textContent = '检测到按钮点击！时间: ' + new Date().toLocaleTimeString();
          statusMsg.style.color = 'red';
          statusMsg.style.fontWeight = 'bold';
        }
        
        // 创建临时元素显示点击检测
        const clickIndicator = document.createElement('div');
        clickIndicator.textContent = '按钮点击已检测到!';
        clickIndicator.style.position = 'fixed';
        clickIndicator.style.top = '10px';
        clickIndicator.style.left = '10px';
        clickIndicator.style.backgroundColor = 'red';
        clickIndicator.style.color = 'white';
        clickIndicator.style.padding = '5px';
        clickIndicator.style.borderRadius = '5px';
        clickIndicator.style.zIndex = '9999';
        document.body.appendChild(clickIndicator);
        
        // 3秒后移除
        setTimeout(() => {
          document.body.removeChild(clickIndicator);
        }, 3000);
        
        // 2秒后调用实际的刷新函数
        setTimeout(() => {
          console.log('调用原始刷新函数');
          refreshInputElements();
        }, 2000);
      });
      
      console.log('点击检测器已添加到刷新按钮');
    } else {
      console.error('找不到刷新按钮元素，ID: refreshButton');
      // 尝试列出所有按钮进行调试
      const allButtons = document.querySelectorAll('button');
      console.log('页面上找到', allButtons.length, '个按钮:');
      allButtons.forEach((btn, index) => {
        console.log(`按钮 ${index + 1}:`, btn.id, btn.className, btn.textContent);
      });
    }
  }
  
  // 添加调试按钮
  function addDebugButton() {
    if (document.getElementById('debugButton')) return;
    
    const debugButton = document.createElement('button');
    debugButton.id = 'debugButton';
    debugButton.textContent = '显示调试信息';
    debugButton.style.backgroundColor = '#ff9800';
    debugButton.style.color = 'white';
    debugButton.style.marginTop = '10px';
    debugButton.style.width = '100%';
    
    debugButton.onclick = function() {
      // 收集调试信息
      collectAndShowDebugInfo();
    };
    
    // 添加到页面
    const container = document.querySelector('.container');
    container.appendChild(debugButton);
    
    // 添加调试区域
    if (!document.getElementById('debugArea')) {
      const debugArea = document.createElement('div');
      debugArea.id = 'debugArea';
      debugArea.style.marginTop = '10px';
      debugArea.style.padding = '10px';
      debugArea.style.backgroundColor = '#f5f5f5';
      debugArea.style.border = '1px solid #ddd';
      debugArea.style.borderRadius = '4px';
      debugArea.style.maxHeight = '200px';
      debugArea.style.overflowY = 'auto';
      debugArea.style.fontFamily = 'monospace';
      debugArea.style.fontSize = '12px';
      debugArea.style.whiteSpace = 'pre-wrap';
      debugArea.style.wordBreak = 'break-all';
      
      container.appendChild(debugArea);
    }
  }
  
  // 收集和显示调试信息
  function collectAndShowDebugInfo() {
    const debugInfo = [];
    
    // 添加基本信息
    debugInfo.push('===== 调试信息 =====');
    debugInfo.push('时间: ' + new Date().toLocaleString());
    debugInfo.push('');
    
    // 检查按钮状态
    const refreshButton = document.getElementById('refreshButton');
    debugInfo.push('刷新按钮存在: ' + !!refreshButton);
    
    if (refreshButton) {
      const style = window.getComputedStyle(refreshButton);
      debugInfo.push('刷新按钮样式:');
      debugInfo.push('- 显示: ' + style.display);
      debugInfo.push('- 可见性: ' + style.visibility);
      debugInfo.push('- 宽度: ' + refreshButton.offsetWidth);
      debugInfo.push('- 高度: ' + refreshButton.offsetHeight);
    }
    
    debugInfo.push('');
    
    // 检查权限
    try {
      chrome.permissions.getAll(function(permissions) {
        debugInfo.push('扩展权限:');
        debugInfo.push(JSON.stringify(permissions, null, 2));
        
        // 获取当前标签
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          debugInfo.push('');
          debugInfo.push('当前标签:');
          debugInfo.push(JSON.stringify(tabs[0], null, 2));
          
          // 显示收集的信息
          showDebugInfo(debugInfo.join('\n'));
          
          // 尝试发送测试消息
          if (tabs && tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'ping', timestamp: Date.now()}, function(response) {
              const pingResult = '内容脚本响应: ' + 
                (response ? JSON.stringify(response) : '无响应') + 
                (chrome.runtime.lastError ? ' 错误: ' + chrome.runtime.lastError.message : '');
              
              showDebugInfo(pingResult, true);
            });
          }
        });
      });
    } catch (e) {
      debugInfo.push('获取权限时出错: ' + e.message);
      showDebugInfo(debugInfo.join('\n'));
    }
  }
  
  // 显示调试信息
  function showDebugInfo(info, append = false) {
    const debugArea = document.getElementById('debugArea');
    if (debugArea) {
      if (append) {
        debugArea.textContent += '\n\n' + info;
      } else {
        debugArea.textContent = info;
      }
      // 滚动到底部
      debugArea.scrollTop = debugArea.scrollHeight;
    }
  }

  function displayInputElementsTable(inputElements) {
    console.log('[popup] 开始显示输入元素表格:', inputElements.length, '个元素');
    
    // 检查是否已有表格容器，如果没有则创建
    let tableContainer = document.getElementById('inputElementsTable');
    if (!tableContainer) {
      // 创建新的表格区域
      const resultSection = document.querySelector('.result-section');
      
      // 创建表格标题
      const tableTitle = document.createElement('h2');
      tableTitle.textContent = '页面输入元素列表';
      tableTitle.style.marginTop = '20px';
      resultSection.appendChild(tableTitle);
      
      // 创建表格容器
      tableContainer = document.createElement('div');
      tableContainer.id = 'inputElementsTable';
      tableContainer.className = 'table-container';
      resultSection.appendChild(tableContainer);
    }
    
    // 清空当前表格
    tableContainer.innerHTML = '';
    
    // 如果没有input元素，显示提示信息
    if (!inputElements || inputElements.length === 0) {
      tableContainer.innerHTML = '<p>当前页面没有找到输入元素</p>';
      return;
    }
    
    // 创建表格
    const table = document.createElement('table');
    table.className = 'input-elements-table';
    
    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const headers = ['类型', '字段名称', 'ID/名称', 'XPath', '相邻文本'];
    headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 创建表格内容
    const tbody = document.createElement('tbody');
    
    inputElements.forEach(input => {
      const row = document.createElement('tr');
      
      // 添加类型列
      const typeCell = document.createElement('td');
      typeCell.textContent = input.type || '';
      row.appendChild(typeCell);
      
      // 添加字段名称列
      const fieldNameCell = document.createElement('td');
      fieldNameCell.textContent = input.fieldName || '';
      fieldNameCell.title = input.fieldName || '';
      row.appendChild(fieldNameCell);
      
      // 添加ID/名称列
      const idNameCell = document.createElement('td');
      const idName = input.id || input.name || '';
      idNameCell.textContent = idName;
      if (idName) {
        idNameCell.title = idName;
      }
      row.appendChild(idNameCell);
      
      // 添加XPath列
      const xpathCell = document.createElement('td');
      xpathCell.textContent = input.xpath || '';
      xpathCell.title = input.xpath; // 添加悬停提示，便于查看完整xpath
      xpathCell.className = 'xpath-cell';
      row.appendChild(xpathCell);
      
      // 添加相邻文本列
      const textsCell = document.createElement('td');
      textsCell.textContent = (input.nearTexts && input.nearTexts.length > 0) 
        ? input.nearTexts.join(' | ') 
        : '';
      textsCell.title = textsCell.textContent; // 添加悬停提示
      textsCell.className = 'texts-cell';
      row.appendChild(textsCell);
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    
    // 添加按钮容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'table-buttons-container';
    
    // 添加复制按钮
    const copyButton = document.createElement('button');
    copyButton.textContent = '复制表格数据';
    copyButton.className = 'copy-button';
    copyButton.addEventListener('click', function() {
      copyTableDataToClipboard(inputElements);
    });
    
    buttonsContainer.appendChild(copyButton);
    tableContainer.appendChild(buttonsContainer);
    
    console.log('[popup] 输入元素表格显示完成');
  }

  // 复制表格数据到剪贴板
  function copyTableDataToClipboard(inputElements) {
    if (!inputElements || inputElements.length === 0) {
      alert('没有数据可复制');
      return;
    }
    
    console.log('[popup] 开始复制表格数据到剪贴板');
    
    // 构建CSV格式数据
    let csvContent = '类型,字段名称,ID/名称,XPath,相邻文本\n';
    
    inputElements.forEach(input => {
      const type = input.type || '';
      const fieldName = input.fieldName || '';
      const idName = input.id || input.name || '';
      const xpath = input.xpath || '';
      const texts = (input.nearTexts && input.nearTexts.length > 0) 
        ? input.nearTexts.join(' | ') 
        : '';
      
      // 转义CSV字段中的逗号和引号
      const escapedFieldName = fieldName.replace(/"/g, '""');
      const escapedIdName = idName.replace(/"/g, '""');
      const escapedXpath = xpath.replace(/"/g, '""');
      const escapedTexts = texts.replace(/"/g, '""');
      
      csvContent += `${type},"${escapedFieldName}","${escapedIdName}","${escapedXpath}","${escapedTexts}"\n`;
    });
    
    // 复制到剪贴板
    navigator.clipboard.writeText(csvContent)
      .then(() => {
        console.log('[popup] 表格数据已复制到剪贴板');
        updateStatus('表格数据已复制到剪贴板', 'success');
      })
      .catch(err => {
        console.error('[popup] 复制到剪贴板失败:', err);
        updateStatus('复制失败: ' + err.message, 'error');
        
        // 备用方法：使用textarea元素
        try {
          const textArea = document.createElement('textarea');
          textArea.value = csvContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          updateStatus('表格数据已复制到剪贴板（备用方法）', 'success');
        } catch (e) {
          updateStatus('所有复制方法均失败', 'error');
        }
      });
  }

  // 刷新input元素函数
  function refreshInputElements() {
    console.log('[popup] 开始刷新输入元素...');
    
    // 更新状态消息
    updateStatus('正在刷新输入元素...', 'info');
    
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        console.error('[popup] 未找到活动标签页');
        updateStatus('错误：未找到活动标签页', 'error');
        return;
      }

      const currentTab = tabs[0];
      console.log('[popup] 当前标签页:', currentTab.url);
      
      // 检查URL，确保是有效的网页
      if (!currentTab.url || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://')) {
        console.warn('[popup] 不支持的URL:', currentTab.url);
        updateStatus('不支持的页面: ' + currentTab.url, 'warning');
        return;
      }
      
      // 首先尝试发送ping消息检查content脚本是否已加载
      console.log('[popup] 发送ping消息...');
      chrome.tabs.sendMessage(currentTab.id, {action: 'ping'}, function(response) {
        if (chrome.runtime.lastError) {
          console.log('[popup] Ping失败，content脚本未加载:', chrome.runtime.lastError);
          
          // 如果ping失败，尝试注入content脚本
          console.log('[popup] 尝试注入content脚本...');
          chrome.scripting.executeScript(
            {
              target: {tabId: currentTab.id},
              files: ['content.js']
            },
            function(injectionResults) {
              if (chrome.runtime.lastError) {
                console.error('[popup] 注入脚本失败:', chrome.runtime.lastError);
                updateStatus('注入脚本失败: ' + chrome.runtime.lastError.message, 'error');
                return;
              }
              
              console.log('[popup] 脚本注入成功，请求输入元素');
              requestInputElements(currentTab);
            }
          );
        } else {
          console.log('[popup] Ping成功，content脚本已加载:', response);
          // 如果ping成功，直接请求输入元素
          requestInputElements(currentTab);
        }
      });
    });
  }

  function requestInputElements(tab) {
    console.log('[popup] 发送getInputElements消息...');
    
    chrome.tabs.sendMessage(
      tab.id, 
      {action: 'getInputElements'}, 
      function(response) {
        if (chrome.runtime.lastError) {
          console.error('[popup] 获取输入元素出错:', chrome.runtime.lastError);
          updateStatus('获取输入元素出错: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (!response) {
          console.error('[popup] 未收到响应');
          updateStatus('未收到响应', 'error');
          return;
        }
        
        console.log('[popup] 收到响应:', response);
        
        if (response.success) {
          const elements = response.data || [];
          console.log('[popup] 找到', elements.length, '个输入元素');
          
          // 显示元素表格
          displayInputElementsTable(elements);
          
          // 更新状态
          if (elements.length > 0) {
            updateStatus('找到 ' + elements.length + ' 个输入元素', 'success');
          } else {
            updateStatus('未找到输入元素', 'warning');
          }
        } else {
          console.error('[popup] 获取元素失败:', response.message);
          updateStatus('获取元素失败: ' + response.message, 'error');
        }
      }
    );
  }

  // 添加测试按钮
  function addTestButton() {
    if (document.getElementById('testButton')) return;
    
    const testButton = document.createElement('button');
    testButton.id = 'testButton';
    testButton.textContent = 'Test';
    testButton.style.backgroundColor = '#2196F3';
    testButton.style.color = 'white';
    testButton.style.border = 'none';
    testButton.style.padding = '8px 16px';
    testButton.style.margin = '10px 0';
    testButton.style.borderRadius = '4px';
    testButton.style.cursor = 'pointer';
    testButton.style.fontWeight = 'bold';
    
    // 添加悬停效果
    testButton.onmouseover = function() {
      this.style.backgroundColor = '#0b7dda';
    };
    testButton.onmouseout = function() {
      this.style.backgroundColor = '#2196F3';
    };
    
    // 添加点击事件
    testButton.addEventListener('click', function() {
      console.log('测试按钮被点击了！', new Date().toLocaleString());
      refreshInputElements();
    });
    
    // 将按钮添加到页面
    const container = document.querySelector('.container') || document.body;
    container.insertBefore(testButton, container.firstChild);
    
    console.log('测试按钮已添加到页面');
  }

  // 设置测试按钮的点击事件处理器
  function setupTestButtonEvent() {
    console.log('设置测试按钮事件...');
    const testBtn = document.getElementById('testButton');
    
    if (testBtn) {
      console.log('找到测试按钮，正在添加点击事件');
      
      testBtn.addEventListener('click', function() {
        console.log('测试按钮被点击了！时间:', new Date().toLocaleString());
        document.getElementById('statusMessage').textContent = '测试按钮触发获取元素 - ' + new Date().toLocaleTimeString();
        
        // 添加视觉反馈
        this.style.backgroundColor = 'green';
        setTimeout(() => {
          this.style.backgroundColor = '#ff0000';
        }, 500);
        
        // 手动实现获取input元素的功能，不依赖refreshInputElements函数
        console.log('测试按钮执行获取input元素操作');
        
        // 获取当前标签页
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (!tabs || !tabs[0]) {
            console.error('无法获取当前标签页');
            document.getElementById('statusMessage').textContent = '错误: 无法获取当前标签页';
            return;
          }
          
          const tabId = tabs[0].id;
          console.log('当前标签页ID:', tabId);
          
          // 注入content脚本
          chrome.scripting.executeScript({
            target: {tabId: tabId},
            files: ['content.js']
          }, function(injectionResults) {
            console.log('content.js 注入结果:', injectionResults);
            
            // 发送消息给content脚本获取input元素
            chrome.tabs.sendMessage(tabId, {action: 'getInputElements'}, function(response) {
              console.log('收到响应:', response);
              
              if (chrome.runtime.lastError) {
                console.error('获取元素时出错:', chrome.runtime.lastError);
                document.getElementById('statusMessage').textContent = '错误: ' + chrome.runtime.lastError.message;
                return;
              }
              
              if (!response || !response.success) {
                console.error('获取元素失败:', response?.error || '未知错误');
                document.getElementById('statusMessage').textContent = '获取元素失败: ' + (response?.error || '未知错误');
                return;
              }
              
              const elements = response.elements || [];
              console.log('成功获取到', elements.length, '个输入元素');
              
              // 显示获取到的元素
              if (elements.length > 0) {
                displayInputElementsTable(elements);
                document.getElementById('statusMessage').textContent = 
                  '成功获取到 ' + elements.length + ' 个输入元素';
              } else {
                document.getElementById('statusMessage').textContent = '未找到任何输入元素';
              }
            });
          });
        });
      });
      
      console.log('测试按钮事件设置完成');
    } else {
      console.error('未找到测试按钮元素');
    }
  }

  // 页面加载后也设置一次测试按钮事件
  window.addEventListener('load', function() {
    console.log('window.load 事件触发');
    setupTestButtonEvent();
  });

  // 立即尝试设置一次测试按钮事件
  setupTestButtonEvent();

  // 额外的保障：页面加载后再次尝试初始化
  window.onload = function() {
    console.log('window.onload 事件触发');
    initTestButton();
  };

  // 立即尝试初始化一次（以防脚本在DOM已加载后执行）
  initTestButton();

  // 简单的初始化函数，在多个地方调用以确保执行
  function initTestButton() {
    console.log('尝试初始化测试按钮...');
    
    const testBtn = document.getElementById('testButton');
    if (testBtn) {
      console.log('找到测试按钮，添加点击事件');
      
      // 移除任何现有的点击事件处理器
      testBtn.onclick = null;
      const clone = testBtn.cloneNode(true);
      testBtn.parentNode.replaceChild(clone, testBtn);
      
      // 添加新的点击事件
      clone.onclick = function() {
        console.log('测试按钮被点击了！', new Date().toLocaleString());
        refreshInputElements();
        
        // 添加视觉反馈
        this.style.backgroundColor = 'green';
        setTimeout(() => {
          this.style.backgroundColor = '#ff0000';
        }, 500);
      };
      
      console.log('测试按钮事件已添加');
    } else {
      console.error('找不到测试按钮');
    }
  }

  // 新函数：处理提取的数据
  function processExtractedData(data, originalText) {
    extractedData = data;
    
    // 保存到本地存储
    chrome.storage.local.set({
      lastText: originalText,
      lastExtractedData: extractedData
    });
    
    // 显示提取结果
    displayExtractedData(extractedData);
    
    // 启用填写按钮
    fillButton.disabled = false;
    
    updateStatus('信息提取成功！', 'success');
  }
}); 