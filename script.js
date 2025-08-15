document.addEventListener('DOMContentLoaded', () => {
    const nodeInput = document.getElementById('node-input');
    const remarkList = document.getElementById('remark-list');
    const sortButton = document.getElementById('sort-button');

    let nodeData = [];
    let draggedItem = null;

    const REMARK_REGEX = /^([^-]+)-([^-]+)-(Tier\d+)(?:-sid:([^-]+))?(?:-sn:(\d+))?(?:-flag:([A-Z]))?$/;

    const processInput = () => {
        const links = nodeInput.value.split('\n').filter(line => line.trim() !== '');
        
        nodeData = links.map((link, index) => {
            const data = {
                id: index,
                originalLink: link,
                remark: null,
                isValid: false,
                error: null,
                parsed: null,
            };

            try {
                if (!link.startsWith('vmess://')) {
                    throw new Error('无效的 vmess:// 协议');
                }
                const base64Str = link.substring(8);
                const decodedStr = atob(base64Str);
                const config = JSON.parse(decodedStr);
                data.remark = config.ps || config.remark || '无别名';

                const match = data.remark.match(REMARK_REGEX);
                if (match) {
                    data.isValid = true;
                    data.parsed = {
                        country: match[1],
                        region: match[2],
                        tier: parseInt(match[3].replace('Tier', ''), 10),
                        sid: match[4] || null,
                        sn: match[5] ? parseInt(match[5], 10) : null,
                        flag: match[6] || null,
                    };
                    if(data.parsed.sid === null && data.parsed.sn !== null) {
                         throw new Error('别名规则错误: 有sn时必须有sid');
                    }
                } else {
                    throw new Error('别名不符合命名规则');
                }
            } catch (e) {
                data.isValid = false;
                data.error = e.message;
            }
            return data;
        });
        
        render();
    };

    const render = () => {
        remarkList.innerHTML = '';
        nodeData.forEach(item => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            li.draggable = true;

            if (item.isValid) {
                li.textContent = item.remark;
            } else {
                li.classList.add('error');
                const span = document.createElement('span');
                span.textContent = `[错误] ${item.error} - (${item.originalLink.slice(0, 20)}...)`;
                li.appendChild(span);
            }
            remarkList.appendChild(li);
        });
    };
    
    const updateInputFromData = () => {
        nodeInput.value = nodeData.map(item => item.originalLink).join('\n');
    };

    const sortNodes = () => {
        nodeData.sort((a, b) => {
            // 无效节点排在最后
            if (a.isValid && !b.isValid) return -1;
            if (!a.isValid && b.isValid) return 1;
            if (!a.isValid && !b.isValid) return 0;

            const pa = a.parsed;
            const pb = b.parsed;

            // 1. 特殊标志 (flag:D 优先级最高)
            const aFlag = pa.flag === 'D' ? 1 : 0;
            const bFlag = pb.flag === 'D' ? 1 : 0;
            if (aFlag !== bFlag) return bFlag - aFlag;

            // 2. 系列序号 (sn) - 小的在前
            const aSn = pa.sn === null ? Infinity : pa.sn;
            const bSn = pb.sn === null ? Infinity : pb.sn;
            if (aSn !== bSn) return aSn - bSn;

            // 3. 系列标识符 (sid) - 字母序
            const aSid = pa.sid || '';
            const bSid = pb.sid || '';
            const sidCompare = aSid.localeCompare(bSid);
            if (sidCompare !== 0) return sidCompare;

            // 4. Tier等级 - 小的在前
            if (pa.tier !== pb.tier) return pa.tier - pb.tier;
            
            // 5. 地区 - 字母序
            const regionCompare = pa.region.localeCompare(pb.region);
            if (regionCompare !== 0) return regionCompare;

            // 6. 国家 - 字母序
            return pa.country.localeCompare(pb.country);
        });

        updateInputFromData();
        render();
    };
    
    // 事件监听
    nodeInput.addEventListener('input', processInput);
    sortButton.addEventListener('click', sortNodes);

    remarkList.addEventListener('dragstart', e => {
        draggedItem = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });

    remarkList.addEventListener('dragend', e => {
        draggedItem.classList.remove('dragging');
        draggedItem = null;
    });

    remarkList.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(remarkList, e.clientY);
        const currentDragging = document.querySelector('.dragging');
        
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        
        if (afterElement == null) {
            // Do nothing, handled by drop logic
        } else {
            afterElement.classList.add('drag-over');
        }
    });

    remarkList.addEventListener('drop', e => {
        e.preventDefault();
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        
        const draggedId = parseInt(draggedItem.dataset.id);
        const fromIndex = nodeData.findIndex(item => item.id === draggedId);

        const afterElement = getDragAfterElement(remarkList, e.clientY);
        
        const toId = afterElement ? parseInt(afterElement.dataset.id) : null;
        const toIndex = toId === null ? nodeData.length : nodeData.findIndex(item => item.id === toId);

        const [movedItem] = nodeData.splice(fromIndex, 1);
        
        // Correct index if moving downwards
        const finalToIndex = fromIndex < toIndex ? toIndex -1 : toIndex;
        nodeData.splice(finalToIndex, 0, movedItem);

        updateInputFromData();
        render();
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // 初始化
    processInput();
});