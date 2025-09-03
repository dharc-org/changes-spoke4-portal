// Charts helpers (global, no module system)
// Exposes: window.renderPackedBubbleD3(containerEl, data)

(function () {
  if (typeof window === 'undefined') return;

  function renderPackedBubbleD3(containerEl, data) {
    if (typeof d3 === 'undefined') {
      console.warn('D3 not found. Expected at /static/vendor/d3/d3.v7.min.js');
      if (containerEl) {
        containerEl.innerHTML = "<p class='text-danger'>D3 library missing. Please add vendor/d3/d3.v7.min.js</p>";
      }
      return;
    }
    const values = data.map(d => ({ label: d.label || d.type, value: Number(d.count) || 0 }));
    const width = containerEl.clientWidth || 700;
    const height = containerEl.clientHeight || 520;

    // Clear existing and prepare positioning context for tooltip
    containerEl.innerHTML = '';
    d3.select(containerEl).style('position', 'relative');

    const root = d3.pack()
      .size([width, height])
      .padding(4)(
        d3.hierarchy({ children: values })
          .sum(d => d.value)
          .sort((a, b) => (b.value || 0) - (a.value || 0)) // larger more central
      );

    const svg = d3.select(containerEl)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .style('max-width', '100%')
      .style('height', '100%')
      .style('display', 'block');

    const colors = ['#A62176', '#436179', '#C07F6B', '#7D725F', '#9D8F7F', '#6A9FB5', '#B77FBD', '#D2A679', '#6F9E6E', '#B55A5A', '#CDBFB0', '#EFE7DC'];
    const color = (i) => colors[i % colors.length];

    const nodes = svg.append('g')
      .selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    nodes.append('circle')
      .attr('r', d => d.r)
      .attr('fill', (d, i) => color(i))
      .attr('fill-opacity', 0.85);

    // Labels: big bubbles -> label (normal) + count (bold). Medium -> count (bold)
    nodes.filter(d => d.r >= 26).append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('fill', '#fff')
      .style('font-family', 'Work Sans, system-ui, sans-serif')
      .style('font-weight', 400)
      .style('font-size', d => `${Math.min(16, Math.max(10, d.r / 3))}px`)
      .text(d => d.data.label);

    nodes.filter(d => d.r >= 26).append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('fill', '#fff')
      .style('font-family', 'Work Sans, system-ui, sans-serif')
      .style('font-weight', 700)
      .style('font-size', d => `${Math.min(18, Math.max(10, d.r / 3))}px`)
      .text(d => d.data.value);

    nodes.filter(d => d.r >= 16 && d.r < 26).append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', d => d.r >= 20 ? '#fff' : '#1E1E1E')
      .style('font-family', 'Work Sans, system-ui, sans-serif')
      .style('font-weight', 700)
      .style('font-size', d => `${Math.min(16, Math.max(10, d.r / 3))}px`)
      .text(d => d.data.value);

    // Tooltip on hover
    const tooltip = d3.select(containerEl)
      .append('div')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background', 'rgba(30,30,30,0.9)')
      .style('color', '#fff')
      .style('padding', '4px 8px')
      .style('border-radius', '4px')
      .style('font', '12px Work Sans, system-ui, sans-serif')
      .style('opacity', 0);

    nodes.on('mousemove', (event, d) => {
      const [x, y] = d3.pointer(event, containerEl);
      tooltip
        .style('left', `${x + 12}px`)
        .style('top', `${y + 12}px`)
        .style('opacity', 1)
        .html(`${d.data.label}<br><strong>${d.data.value}</strong>`);
    }).on('mouseleave', () => tooltip.style('opacity', 0));
  }

  // Expose globally
  window.renderPackedBubbleD3 = renderPackedBubbleD3;
})();
