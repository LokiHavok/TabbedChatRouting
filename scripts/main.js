class TabbedChatRouter {
  static MODULE_ID = 'tabbed-chat-routing';
  static TABS = {
    WORLD: 'world',
    OOC: 'ooc', 
    GAME: 'game',
    MESSAGES: 'messages'
  };

  constructor() {
    this.currentTab = TabbedChatRouter.TABS.WORLD;
    this.sceneMessages = new Map(); // scene-id -> { tab -> messages[] }
    this.globalMessages = new Map(); // tab -> messages[] (for MESSAGES tab)
    this.initializeStorage();
  }

  initializeStorage() {
    // Initialize scene messages for current scene
    const sceneId = canvas.scene?.id;
    if (sceneId && !this.sceneMessages.has(sceneId)) {
      this.sceneMessages.set(sceneId, {
        [TabbedChatRouter.TABS.WORLD]: [],
        [TabbedChatRouter.TABS.OOC]: [],
        [TabbedChatRouter.TABS.GAME]: []
      });
    }

    // Initialize global messages (MESSAGES tab)
    if (!this.globalMessages.has(TabbedChatRouter.TABS.MESSAGES)) {
      this.globalMessages.set(TabbedChatRouter.TABS.MESSAGES, []);
    }
  }

  async renderChatTabs() {
    // Get the chat log container
    const chatLog = document.querySelector('#chat-log');
    if (!chatLog) return;

    // Create tabs container
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'chat-tabs-container';
    tabsContainer.innerHTML = `
      <div class="chat-tabs">
        <div class="tab ${this.currentTab === TabbedChatRouter.TABS.WORLD ? 'active' : ''}" data-tab="world">WORLD</div>
        <div class="tab ${this.currentTab === TabbedChatRouter.TABS.OOC ? 'active' : ''}" data-tab="ooc">OOC</div>
        <div class="tab ${this.currentTab === TabbedChatRouter.TABS.GAME ? 'active' : ''}" data-tab="game">GAME</div>
        <div class="tab ${this.currentTab === TabbedChatRouter.TABS.MESSAGES ? 'active' : ''}" data-tab="messages">MESSAGES</div>
      </div>
      <div class="tab-content">
        <ol class="chat-messages" id="tabbed-chat-messages"></ol>
      </div>
    `;

    // Insert before chat log
    chatLog.parentNode.insertBefore(tabsContainer, chatLog);
    
    // Hide original chat log
    chatLog.style.display = 'none';

    // Add event listeners
    this.addTabEventListeners();
    
    // Render current tab content
    this.renderTabContent();
  }

  addTabEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    this.currentTab = tabName;
    this.renderTabContent();
  }

  renderTabContent() {
    const messagesContainer = document.querySelector('#tabbed-chat-messages');
    if (!messagesContainer) return;

    messagesContainer.innerHTML = '';

    let messages;
    if (this.currentTab === TabbedChatRouter.TABS.MESSAGES) {
      // Global messages for MESSAGES tab
      messages = this.globalMessages.get(TabbedChatRouter.TABS.MESSAGES) || [];
    } else {
      // Scene-specific messages
      const sceneId = canvas.scene?.id;
      const sceneData = this.sceneMessages.get(sceneId);
      messages = sceneData?.[this.currentTab] || [];
    }

    messages.forEach(message => {
      messagesContainer.appendChild(message.cloneNode(true));
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  getActorNameForUser(user) {
    // Get the user's assigned tokens
    const tokens = canvas.tokens?.placeables?.filter(t => t.actor?.hasPlayerOwner && t.actor.testUserPermission(user, "OWNER")) || [];
    
    if (tokens.length > 0) {
      // Return the first assigned actor's name
      return tokens[0].actor.name;
    }
    
    return user.name;
  }

  shouldShowInCurrentTab(messageData, currentTab) {
    if (messageData.tabType === TabbedChatRouter.TABS.MESSAGES) {
      // For whispers, check if current user is involved or is GM
      if (currentTab !== TabbedChatRouter.TABS.MESSAGES) return false;
      
      const currentUserId = game.user.id;
      const isGM = game.user.isGM;
      
      return isGM || 
             messageData.user.id === currentUserId || 
             (messageData.whisper && messageData.whisper.includes(currentUserId));
    }
    
    return messageData.tabType === currentTab;
  }

  processMessage(messageData, messageElement) {
    let tabType = TabbedChatRouter.TABS.OOC; // default
    let displayName = messageData.user.name;
    let messageContent = messageData.content;

    // Determine tab type based on message type
    if (messageData.type === CONST.CHAT_MESSAGE_TYPES.ROLL) {
      tabType = TabbedChatRouter.TABS.GAME;
    } else if (messageData.type === CONST.CHAT_MESSAGE_TYPES.WHISPER) {
      tabType = TabbedChatRouter.TABS.MESSAGES;
    } else if (messageData.type === CONST.CHAT_MESSAGE_TYPES.IC) {
      tabType = TabbedChatRouter.TABS.WORLD;
      // For IC messages, use actor name
      displayName = this.getActorNameForUser(messageData.user);
    }

    // Handle special commands
    if (messageData.content) {
      const content = messageData.content.trim();
      
      // /b command - OOC with actor name
      if (content.startsWith('/b ')) {
        const actualMessage = content.substring(3);
        const actorName = this.getActorNameForUser(messageData.user);
        displayName = `[OOC] ${actorName}`;
        messageContent = actualMessage;
        tabType = TabbedChatRouter.TABS.OOC;
      }
      
      // /g command - Global message
      if (content.startsWith('/g ')) {
        const actualMessage = content.substring(3);
        displayName = `[Global] ${messageData.user.name}`;
        messageContent = actualMessage;
        tabType = TabbedChatRouter.TABS.OOC;
      }
    }

    // Update message data
    messageData.tabType = tabType;
    messageData.displayName = displayName;
    messageData.processedContent = messageContent;

    // Update the message element's display name
    const speakerName = messageElement.querySelector('.message-sender');
    if (speakerName) {
      speakerName.textContent = displayName;
    }

    // Store the message in appropriate storage
    this.storeMessage(messageData, messageElement.cloneNode(true));

    // Only show if it belongs in current tab and user should see it
    return this.shouldShowInCurrentTab(messageData, this.currentTab);
  }

  storeMessage(messageData, messageElement) {
    if (messageData.tabType === TabbedChatRouter.TABS.MESSAGES) {
      // Store in global messages
      const messages = this.globalMessages.get(TabbedChatRouter.TABS.MESSAGES) || [];
      messages.push(messageElement);
      this.globalMessages.set(TabbedChatRouter.TABS.MESSAGES, messages);
    } else {
      // Store in scene-specific messages
      const sceneId = canvas.scene?.id;
      if (!sceneId) return;

      const sceneData = this.sceneMessages.get(sceneId) || {
        [TabbedChatRouter.TABS.WORLD]: [],
        [TabbedChatRouter.TABS.OOC]: [],
        [TabbedChatRouter.TABS.GAME]: []
      };

      sceneData[messageData.tabType] = sceneData[messageData.tabType] || [];
      sceneData[messageData.tabType].push(messageElement);
      
      this.sceneMessages.set(sceneId, sceneData);
    }
  }

  onSceneChange() {
    this.initializeStorage();
    this.renderTabContent();
  }
}

// Initialize the module
let tabbedChat;

Hooks.once('init', () => {
  console.log('Tabbed Chat Router | Initializing...');
});

Hooks.once('ready', () => {
  tabbedChat = new TabbedChatRouter();
  console.log('Tabbed Chat Router | Ready');
});

// Hook into chat message rendering
Hooks.on('renderChatLog', () => {
  if (tabbedChat) {
    tabbedChat.renderChatTabs();
  }
});

// Hook into new chat messages
Hooks.on('renderChatMessage', (message, html, data) => {
  if (!tabbedChat) return;
  
  const shouldShow = tabbedChat.processMessage(data.message, html[0]);
  
  if (!shouldShow) {
    html.hide();
  } else {
    // Add to current tab if it matches
    tabbedChat.renderTabContent();
  }
});

// Hook into scene changes
Hooks.on('canvasReady', () => {
  if (tabbedChat) {
    tabbedChat.onSceneChange();
  }
});

// Override chat message creation to handle special commands
Hooks.on('preCreateChatMessage', (document, data, options, userId) => {
  if (!data.content) return;
  
  const content = data.content.trim();
  
  // Handle /b command
  if (content.startsWith('/b ')) {
    data.type = CONST.CHAT_MESSAGE_TYPES.OOC;
    // Don't modify content here, let processMessage handle display
  }
  
  // Handle /g command  
  if (content.startsWith('/g ')) {
    data.type = CONST.CHAT_MESSAGE_TYPES.OOC;
    // Don't modify content here, let processMessage handle display
  }
});

console.log('Tabbed Chat Router | Module loaded');
