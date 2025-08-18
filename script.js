document.addEventListener('DOMContentLoaded', () => {
    const nodeInput = document.getElementById('node-input');
    const remarkList = document.getElementById('node-output'); 
    const sortButton = document.getElementById('sort-button');

    let nodeData = [];
    let draggedItem = null;

    const REMARK_REGEX = /^([^-]+)-([^-]+)-(Tier\d+)(?:-sid:([^-]+))?(?:-sn:(\d+))?(?:-flag:([A-Z]))?$/;

        const parseLinkForRemark = (link) => {
        try {
            const protocol = link.split('://')[0];
            switch (protocol) {
                case 'vmess': // Base64 JSON
                    const binaryString = atob(link.substring(8));
                    const utf8Bytes = Uint8Array.from(binaryString, char => char.charCodeAt(0));
                    const decodedStr = new TextDecoder().decode(utf8Bytes);
                    const config = JSON.parse(decodedStr);
                    return { remark: config.ps || config.remark, error: null };
                case 'vless':
                case 'trojan': // URL-based with fragment
                case 'ss':
                    const hashIndex = link.indexOf('#');
                    if (hashIndex !== -1) {
                        return { remark: decodeURIComponent(link.substring(hashIndex + 1)), error: null };
                    }
                    // Handle ss://BASE64 without remark
                    if (protocol === 'ss' && hashIndex === -1) {
                        try {
                           atob(link.substring(5)); // check if it's valid base64
                           return { remark: 'Shadowsocks Node', error: null }; // Default remark
                        } catch(e) { /* fall through to error */ }
                    }
                    return { remark: null, error: '无法提取别名' };
                case 'ssr': // Base64 URL-like
                    const decodedSsr = atob(link.substring(6));
                    const params = new URLSearchParams(decodedSsr.split('/?')[1]);
                    if (params.has('remarks')) {
                        return { remark: atob(params.get('remarks')), error: null };
                    }
                    return { remark: null, error: '无法提取别名' };
                default:
                    return { remark: null, error: '不支持的链接协议' };
            }
        } catch (e) {
            return { remark: null, error: '链接解码失败' };
        }
    };

    const processInput = () => {
        const links = nodeInput.value.split('\n').filter(line => line.trim() !== '');
        
        nodeData = links.map((link, index) => {
            const node = {
                id: index,
                originalLink: link,
                remark: null,
                status: 'INVALID',
                error: null,
                parsed: null,
            };

            const parsedLink = parseLinkForRemark(link);

            if (parsedLink.error) {
                node.error = parsedLink.error;
                return node;
            }
            
            if (!parsedLink.remark) {
                node.error = '无法提取别名';
                return node;
            }

            node.remark = parsedLink.remark;

            const match = node.remark.match(REMARK_REGEX);
            if (match) {
                // 符合命名规则
                const parsed = {
                    country: match[1],
                    region: match[2],
                    tier: parseInt(match[3].replace('Tier', ''), 10),
                    sid: match[4] || null,
                    sn: match[5] ? parseInt(match[5], 10) : null,
                    flag: match[6] || null,
                };

                if (parsed.sid === null && parsed.sn !== null) {
                    node.error = '别名规则冲突: 有sn时必须有sid';
                    // 状态依然是 INVALID
                } else {
                    node.status = 'VALID_RULED';
                    node.parsed = parsed;
                }
            } else {
                // 链接有效，但不符合命名规则
                node.status = 'VALID_UNRULED';
            }
            return node;
        });
        
        render();
    };

    const render = () => {
        const scrollTop = remarkList.scrollTop;
        remarkList.innerHTML = '';
        nodeData.forEach(item => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            li.draggable = true;

            switch (item.status) {
                case 'VALID_RULED':
                    li.classList.add('status-ruled');
                    li.textContent = item.remark;
                    break;
                case 'VALID_UNRULED':
                    li.classList.add('status-unruled');
                    li.textContent = item.remark;
                    break;
                case 'INVALID':
                    li.classList.add('error');
                    const span = document.createElement('span');
                    span.textContent = `[错误] ${item.error} - (${item.originalLink.slice(0, 20)}...)`;
                    li.appendChild(span);
                    break;
            }
            remarkList.appendChild(li);
        });
        remarkList.scrollTop = scrollTop;
    };
    
    const updateInputFromData = () => {
        nodeInput.value = nodeData.map(item => item.originalLink).join('\n');
    };

    const sortNodes = () => {
        // 定义状态的排序优先级
        const statusPriority = {
            'VALID_RULED': 1,
            'VALID_UNRULED': 2,
            'INVALID': 3
        };

        nodeData.sort((a, b) => {
            // 首先按状态排序
            const statusDiff = statusPriority[a.status] - statusPriority[b.status];
            if (statusDiff !== 0) return statusDiff;

            // 如果都是规则节点，则按详细规则排序
            if (a.status === 'VALID_RULED' && b.status === 'VALID_RULED') {
                const pa = a.parsed;
                const pb = b.parsed;

                // 排序优先级: flag > sid > sn > Tier > region > country

                // 1. 特殊标志 (flag:D 优先)
                const aFlag = pa.flag === 'D' ? 1 : 0;
                const bFlag = pb.flag === 'D' ? 1 : 0;
                if (aFlag !== bFlag) return bFlag - aFlag;

                // 2. 系列标识符 (sid) - 字母序
                // 有 sid 的节点优先于没有 sid 的节点
                if (pa.sid && !pb.sid) return -1;
                if (!pa.sid && pb.sid) return 1;
                if (pa.sid && pb.sid) {
                    const sidCompare = pa.sid.localeCompare(pb.sid);
                    if (sidCompare !== 0) return sidCompare;
                }
                // 如果 sid 相同 (或都为 null), 则继续比较 sn

                // 3. 系列序号 (sn) - 数字越小越优先
                // 在同一个 sid 组内，按 sn 排序
                const aSn = pa.sn === null ? Infinity : pa.sn;
                const bSn = pb.sn === null ? Infinity : pb.sn;
                if (aSn !== bSn) return aSn - bSn;
                
                // 4. Tier等级 (数字越小越优先)
                if (pa.tier !== pb.tier) return pa.tier - pb.tier;

                // 5. 地区 (字母序)
                const regionCompare = pa.region.localeCompare(pb.region);
                if (regionCompare !== 0) return regionCompare;

                // 6. 国家 (字母序)
                return pa.country.localeCompare(pb.country);
            }

            // 对于非规则节点或错误节点，按别名排序
            if (a.remark && b.remark) {
                return a.remark.localeCompare(b.remark);
            }

            return 0;
        });
        updateInputFromData();
        render();
    };
    
    nodeInput.addEventListener('input', processInput);
    sortButton.addEventListener('click', sortNodes);

    remarkList.addEventListener('dragstart', e => {
        draggedItem = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });

    remarkList.addEventListener('dragend', e => {
        if (!draggedItem) return;
        draggedItem.classList.remove('dragging');
        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
            el.style.paddingTop = '';
            el.style.paddingBottom = '';
        });
        draggedItem = null;
    });

    remarkList.addEventListener('dragover', e => {
        e.preventDefault();
        if (!draggedItem) return;

        const afterElement = getDragAfterElement(remarkList, e.clientY);
        
        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
            el.style.paddingTop = '';
            el.style.paddingBottom = '';
        });

        // 实时移动 DOM 元素
        if (afterElement == null) {
            remarkList.appendChild(draggedItem);
            const lastElement = remarkList.lastChild.previousSibling;
            if(lastElement) {
                lastElement.classList.add('drag-over-bottom');
                lastElement.style.paddingBottom = '5px';
            }
        } else {
            remarkList.insertBefore(draggedItem, afterElement);
            afterElement.classList.add('drag-over-top');
            afterElement.style.paddingTop = '5px';
        }
    });

    remarkList.addEventListener('drop', e => {
        e.preventDefault();
        if (!draggedItem) return;

        const newOrderedIds = Array.from(remarkList.children).map(li => parseInt(li.dataset.id));
        
        nodeData = newOrderedIds.map(id => nodeData.find(item => item.id === id));
        
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

    processInput();
});