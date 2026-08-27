(() => {
  const POSITIVE_MAJOR_EVENTS = new Set(['aiBoom', 'urbanRenewal', 'cashGrant']);
  const NEGATIVE_MAJOR_EVENTS = new Set(['financialCrash', 'earthquake', 'inflation']);

  function applyAnnouncementTones(room) {
    const actionOverlay = document.querySelector('.action-showcase');
    if (actionOverlay) {
      actionOverlay.classList.remove('tone-help', 'tone-sabotage');
      const event = room?.game?.lastEvent;
      const showcaseUntil = Number(room?.game?.showcaseUntil || 0);
      const now = Number(room?.serverTime || Date.now());
      if (showcaseUntil > now && event?.type === 'help') {
        actionOverlay.classList.add('tone-help');
      } else if (showcaseUntil > now && event?.type === 'sabotage') {
        actionOverlay.classList.add('tone-sabotage');
      }
    }

    const majorOverlay = document.querySelector('.major-event-overlay');
    if (majorOverlay) {
      majorOverlay.classList.remove('tone-major-positive', 'tone-major-negative');
      const eventId = room?.game?.majorEvent?.id;
      if (POSITIVE_MAJOR_EVENTS.has(eventId)) {
        majorOverlay.classList.add('tone-major-positive');
      } else if (NEGATIVE_MAJOR_EVENTS.has(eventId)) {
        majorOverlay.classList.add('tone-major-negative');
      }
    }
  }

  socket.on('room:update', applyAnnouncementTones);
})();
